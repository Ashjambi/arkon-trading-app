import { preTradeRiskGuard } from './PreTradeRiskGuard';
import { strategyRiskBudgetService } from './StrategyRiskBudgetService';
import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';
import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';
import { tailRiskModeService } from './TailRiskModeService';
import { executionStyleService } from './ExecutionStyleService';
import { smartOrderRouterService } from './SmartOrderRouterService';
import { childOrderSchedulerService } from './ChildOrderSchedulerService';
import { childOrderTimingOverlayService } from './ChildOrderTimingOverlayService';
import { executionQualityMonitorService } from './ExecutionQualityMonitorService';
import { postTradeExecutionReportService } from './PostTradeExecutionReportService';
import { executionAnalyticsService } from './ExecutionAnalyticsService';
import { executionTcaAggregatorService, ChildExecutionTcaInput } from './ExecutionTcaAggregatorService';







import { riskLimitsService } from './RiskLimitsService';
import { tradingControlService } from './TradingControlService';
import { diagnosticsService } from './DiagnosticsService';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';
import { executionSanityDiagnosticService } from './ExecutionSanityDiagnosticService';
import { AppConfig, LogType, TradingSignal, MarketAnalysisState } from '../types';
import { sendToWebhook, checkBridgeStatus } from './webhookService';
import { sendSignalToTelegram, sendTradeExecutionAlertToTelegram } from './telegramService';
import { ComplianceGatekeeper } from './ComplianceGatekeeper';
import { allocateWeightedSizes } from './PositionSizingService';
import { stressScenarioService } from './StressScenarioService';

export class ExecutionOrchestrator {
    private config: AppConfig;
    private addLog: (message: string, type: LogType, details?: string | object) => void;
    private bridgeStatus: boolean | null;
    private complianceGatekeeper: ComplianceGatekeeper;

    constructor(
        config: AppConfig,
        bridgeStatus: boolean | null,
        addLog: (message: string, type: LogType, details?: string | object) => void
    ) {
        this.config = config;
        this.bridgeStatus = bridgeStatus;
        this.addLog = addLog;
        this.complianceGatekeeper = new ComplianceGatekeeper(config);
    }

    public updateState(config: AppConfig, bridgeStatus: boolean | null) {
        this.config = config;
        this.bridgeStatus = bridgeStatus;
        this.complianceGatekeeper.updateConfig(config);
    }

    
    public async executePlan(signals: any[], analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        let anySuccess = false;
        
        // 1. Read existing config / risk limits
        const asset = signals.length > 0 ? signals[0].asset : 'UNKNOWN';
        const snapshot = riskLimitsService.getSnapshot();
        const assetState = snapshot.assets[asset] || { openPositions: 0, currentExposure: 0 };
        
        let maxConcurrent = this.config.maxTradesPerWave || 1;
        
        // --- STRESS SCENARIO HOOK: maxSignalsCapOverride ---
        const capOverride = stressScenarioService.getMaxSignalsCapOverride();
        if (capOverride !== null) {
            maxConcurrent = capOverride;
            this.addLog(`🧪 [STRESS] Override maxConcurrent to ${capOverride}`, 'SYSTEM');
        }

        const availableSlots = Math.max(0, maxConcurrent - (assetState as any).openPositions);
        
        // 2. Build Execution Plan
        const signalsToExecute = signals.slice(0, availableSlots);
        
        if (signals.length > 0 && availableSlots === 0) {
            this.addLog(`⛔ [EXECUTION PLAN] No available slots for ${asset} (max ${maxConcurrent}, open ${(assetState as any).openPositions})`, 'SYSTEM');
        }

        // 3. Size the signals using quality-score-weighted sizing
        let totalSize = 0;
        if (signalsToExecute.length > 0) {
            const baseLotSize = asset.includes('BTC') ? this.config.fixedLotSizeBTC : this.config.fixedLotSizeETH;
            totalSize = signalsToExecute[0].recommendedSize || baseLotSize;
        }

        const sizedSignals = allocateWeightedSizes(signalsToExecute, totalSize);
        
        if (sizedSignals.length > 1) {
            this.addLog(`⚖️ [POSITION SIZING] Allocated ${totalSize} total size across ${sizedSignals.length} parallel signals based on quality score weights.`, 'EXEC');
        }

        // 4. Iterate and execute
        for (let i = 0; i < sizedSignals.length; i++) {
            const signal = sizedSignals[i];
            
            const success = await this.executeSignal(signal, analysis, actionType, crlState);
            if (success) anySuccess = true;
        }
        
        return anySuccess;
    }

    public async executeSignal(signal: any, analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        // Initialize trace if it's a direct execution (bypassed coordinator) or just to be safe
        const currentTrace = executionDecisionTraceService.getLatestSnapshot();
        if (!currentTrace || !currentTrace.signal || currentTrace.signal.id !== signal.id) {
             executionDecisionTraceService.initTrace(signal, false);
        }
        try {
        // Evaluate compliance gates
        const compliance = this.complianceGatekeeper.validateSignal(signal, analysis);
        if (!compliance.passed && actionType === 'ENTRY') {
            this.addLog(`⛔ [GATE REJECTED] ${compliance.reason}`, 'SYSTEM');
            executionDecisionTraceService.recordBlock('RISK_LIMITS', compliance.reason);
            return false;
        }

        this.addLog(`🚀 [EXECUTION START] تمرير الإشارة للميتاتريدر | Action: ${actionType}`, 'EXEC');

        // --- STRESS SCENARIO HOOK: forceDegradedData ---
        if (stressScenarioService.shouldForceDegradedData()) {
            tradingControlService.recordDegradedData();
            this.addLog(`🧪 [STRESS] Simulated Degraded Data`, 'SYSTEM');
        }

        // Check Runtime Trading Control Layer
        const controlMode = tradingControlService.evaluateControlState();
        if (controlMode === 'BLOCKED') {
            const blockReason = tradingControlService.getSnapshot().lastBlockReason || 'Unknown';
            executionDecisionTraceService.recordTradingControl('BLOCKED');
            executionDecisionTraceService.recordBlock('TRADING_CONTROL', blockReason);
            this.addLog(`⛔ [CONTROL BLOCKED] تم منع تنفيذ الصفقة بواسطة نظام الحماية: ${blockReason}`, 'SYSTEM');
            return false;
        }





        // Check Execution Quality Hints
        const forceDelay = stressScenarioService.shouldForceDelay();
        if (signal.executionHints || forceDelay) {
            const hints = signal.executionHints || { shouldDelay: false, shouldSkip: false, reason: '', executionMode: 'NORMAL' };
            
            if (forceDelay) {
                hints.shouldDelay = true;
                hints.reason = (hints.reason ? hints.reason + ' | ' : '') + 'STRESS_FORCED_DELAY';
            }
            
            // Record execution quality
            diagnosticsService.recordExecutionQuality(
                hints.executionMode, 
                signal.recommendedSize || 0
            );


            if (hints.shouldSkip) {
                tradingControlService.recordExecutionSkip();
                executionDecisionTraceService.recordBlock('EXECUTION_ORCHESTRATOR', hints.reason);
                this.addLog(`⛔ [EXECUTION SKIP] تم تجاهل الإشارة بسبب ظروف التنفيذ: ${hints.reason}`, 'EXEC');
                return false;
            }
            if (hints.shouldDelay) {
                tradingControlService.recordExecutionDelay();
                this.addLog(`⚠️ [EXECUTION DELAYED] إشارة تأخير (تنفيذ فوري مخفف): ${hints.reason}`, 'EXEC');
            } else if (!hints.shouldSkip) {
                tradingControlService.recordNormalExecution();
            }
        } else {
            tradingControlService.recordNormalExecution();
        }


        // Deep clone signal
        const signalToSend = { ...signal };


        // Adjust reference price if PRICE_IMPROVED is suggested
        if (signalToSend.executionHints?.executionMode === 'PRICE_IMPROVED' && signalToSend.executionHints.referencePrice) {
            this.addLog(`💡 استخدام سعر المايكرو المحسن: ${signalToSend.executionHints.referencePrice.toFixed(2)} بدلاً من ${signalToSend.entry.toFixed(2)}`, 'EXEC');
            signalToSend.entry = signalToSend.executionHints.referencePrice;
        }

        // Hedge/Disabling SL logic
        if ((actionType === 'ENTRY' || actionType === 'HEDGE' || actionType === 'FLIP') && 
            (this.config.autoHedgeEnabled || this.config.disableInitialSL)) {
            signalToSend.stopLoss = 0;
            signalToSend.sl = 0;
            this.addLog(`🛡️ نظام الهيدج/التعطيل نِشط: تم مسح الستوب لوز`, 'HEDGE');
        }

        let baseLotSize = this.config.fixedLotSizeETH;
        if (signalToSend.asset.includes('BTC')) baseLotSize = this.config.fixedLotSizeBTC;
        let executedLotSize = signalToSend.recommendedSize !== undefined ? signalToSend.recommendedSize : baseLotSize;

        // Apply Profit-Based Lot Scaling System:
        // BTC lot size increases by 0.01 for every $1000 increment in CLOSED PROFIT
        // ETH lot size increases by 0.1 for every $1000 increment in CLOSED PROFIT
        const currentProfit = (crlState && typeof crlState.diff === 'number' && crlState.diff > 0) ? crlState.diff : 0;
        const increments = Math.floor(currentProfit / 1000);
        if (increments > 0) {
            if (signalToSend.asset.includes('BTC')) {
                executedLotSize = executedLotSize + (increments * 0.01);
                this.addLog(`📈 [LOT SCALING] مضاعفة اللوت بناءً على الأرباح المحققة ($${currentProfit.toFixed(2)}): تم زيادة لوت البيتكوين بمقدار ${(increments * 0.01).toFixed(2)} ليصبح ${executedLotSize.toFixed(2)}`, 'RISK');
            } else if (signalToSend.asset.includes('ETH')) {
                executedLotSize = executedLotSize + (increments * 0.1);
                this.addLog(`📈 [LOT SCALING] مضاعفة اللوت بناءً على الأرباح المحققة (${currentProfit.toFixed(2)}): تم زيادة لوت الإيثيريوم بمقدار ${(increments * 0.1).toFixed(1)} ليصبح ${executedLotSize.toFixed(2)}`, 'RISK');
            }
        }
        
        // Apply quantitative institutional hedge scaling (reduce lot size by hedge ratio if action is HEDGE)
        if (actionType === 'HEDGE' && this.config.autoHedgeEnabled) {
             const ratio = this.config.hedgeRatio || 0.5;
             executedLotSize = executedLotSize * ratio;
             this.addLog(`🛡️ تم تقليص حجم العقد إلى ${executedLotSize.toFixed(3)} بسبب حالة الهيدج/التحوط`, 'HEDGE');
        }


        // Apply Execution Quality penalty if available
        if (signalToSend.executionHints && signalToSend.executionHints.executionPenaltyFactor < 1.0) {
             const penalty = signalToSend.executionHints.executionPenaltyFactor;
             executedLotSize = executedLotSize * penalty;
             this.addLog(`📉 تقليص حجم العقد بسبب ظروف التنفيذ (عامل: ${penalty.toFixed(2)}) ليصبح ${executedLotSize.toFixed(3)}`, 'RISK');
        }

        // Apply risk engine dynamic multiplier

        if (signalToSend.lotMultiplier && signalToSend.lotMultiplier < 1.0) {
             executedLotSize = executedLotSize * signalToSend.lotMultiplier;
             this.addLog(`📉 نظام المخاطر قلص الحجم بمعامل ${signalToSend.lotMultiplier.toFixed(2)} ليصبح ${executedLotSize.toFixed(3)}`, 'RISK');
        }

        // --- STRESS SCENARIO HOOK: executionPenaltyFactor ---
        executedLotSize = stressScenarioService.applyExecutionPenalty(executedLotSize);
        // --- ANTI-MARGIN CALL / BROKER MIN LOT ENFORCEMENT ---
        // If the lot size falls below the broker's minimum (0.01), we round it up to the minimum
        // instead of aborting, so small accounts can still take correlated trades.
        const MIN_BROKER_LOT = 0.01;
        if (executedLotSize < MIN_BROKER_LOT && actionType === 'ENTRY') {
             this.addLog(`⚠️ تحذير: حجم العقد المطلوب بعد تقليل المخاطر (${executedLotSize.toFixed(3)}) أقل من الحد الأدنى للوسيط (${MIN_BROKER_LOT}). تم رفع الحجم للحد الأدنى.`, 'RISK');
             executedLotSize = MIN_BROKER_LOT;
        }

        // Make sure we format it nicely to avoid floating point issues
        executedLotSize = Math.max(MIN_BROKER_LOT, Number(executedLotSize.toFixed(2)));

        // --- STRATEGY RISK BUDGET OVERLAY ---
        const strategyName = signalToSend.strategy || 'UNKNOWN';
        const budgetCheck = strategyRiskBudgetService.canAllocate(strategyName, executedLotSize);
        if (!budgetCheck.allowed || budgetCheck.approvedSize === 0) {
            executionDecisionTraceService.recordBlock('STRATEGY_RISK_BUDGET', budgetCheck.reason || 'STRATEGY_BUDGET_EXHAUSTED');
            this.addLog(`⛔ [STRATEGY BUDGET] تم منع تنفيذ الاستراتيجية ${strategyName} لاستنفاد الميزانية المخصصة لها.`, 'SYSTEM');
            return false;
        } else if (budgetCheck.approvedSize < executedLotSize) {
            this.addLog(`⚠️ [STRATEGY BUDGET] تم تقليص حجم التنفيذ للاستراتيجية ${strategyName} من ${executedLotSize} إلى ${budgetCheck.approvedSize.toFixed(3)} بسبب الحد الأقصى للاستراتيجية.`, 'RISK');
            executedLotSize = budgetCheck.approvedSize;
            signalToSend.recommendedSize = executedLotSize;
        }

        // --- PORTFOLIO VOLATILITY TARGET OVERLAY ---
        const volScale = portfolioVolatilityTargetService.computeScale();
        if (volScale !== 1.0) {
            let scaledSize = executedLotSize * volScale;
            this.addLog(`📊 [PORTFOLIO VOLATILITY] تم تعديل الحجم بمعامل ${volScale.toFixed(2)} ليصبح ${scaledSize.toFixed(3)}`, 'RISK');
            
            if (volScale > 1.0) {
                const reCheck = strategyRiskBudgetService.canAllocate(strategyName, scaledSize);
                if (reCheck.approvedSize < scaledSize) {
                    this.addLog(`⚠️ [PORTFOLIO VOLATILITY] تم تقليص الحجم من ${scaledSize.toFixed(3)} إلى ${reCheck.approvedSize.toFixed(3)} لاحترام ميزانية الاستراتيجية.`, 'RISK');
                    scaledSize = reCheck.approvedSize;
                }
            }

            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;
            
            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).portfolioVolatilityScale = volScale;
                }
            }
        }

        // --- PORTFOLIO DRAWDOWN FLOOR OVERLAY ---
        const drawdownScale = portfolioDrawdownFloorService.computeRiskScale();
        const drawdownMode = portfolioDrawdownFloorService.getCurrentMode();
        if (drawdownScale !== 1.0) {
            if (drawdownScale === 0.0) {
                executionDecisionTraceService.recordBlock('PORTFOLIO_DRAWDOWN', `Blocked due to ${drawdownMode}`);
                this.addLog(`⛔ [PORTFOLIO DRAWDOWN] تم منع تنفيذ الصفقة بسبب التراجع الشديد (${drawdownMode})`, 'SYSTEM');
                return false;
            }

            let scaledSize = executedLotSize * drawdownScale;
            this.addLog(`📉 [PORTFOLIO DRAWDOWN] تم تعديل الحجم بمعامل ${drawdownScale.toFixed(2)} ليصبح ${scaledSize.toFixed(3)} (الوضع: ${drawdownMode})`, 'RISK');
            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).portfolioDrawdownScale = drawdownScale;
                    (trace.executionDecision as any).portfolioDrawdownMode = drawdownMode;
                }
            }
        }

        // --- TAIL RISK MODE OVERLAY ---
        const tailMode = tailRiskModeService.getMode();
        const tailScale = tailRiskModeService.getTailScale();
        
        if (tailMode === 'TAIL_RISK') {
            if (!tailRiskModeService.shouldAllowStrategy(strategyName)) {
                executionDecisionTraceService.recordBlock('TAIL_RISK', `Strategy ${strategyName} blocked in TAIL_RISK mode`);
                this.addLog(`⛔ [TAIL RISK] تم منع تنفيذ الاستراتيجية ${strategyName} لأنها غير مصرح بها أثناء وضع الطوارئ.`, 'SYSTEM');
                return false;
            }
        }
        
        if (tailScale !== 1.0) {
            if (tailScale === 0.0) {
                executionDecisionTraceService.recordBlock('TAIL_RISK', `Blocked due to TAIL_RISK scale 0.0`);
                this.addLog(`⛔ [TAIL RISK] تم منع تنفيذ الصفقة بسبب وضع الطوارئ (المعامل 0)`, 'SYSTEM');
                return false;
            }

            let scaledSize = executedLotSize * tailScale;
            this.addLog(`🚨 [TAIL RISK] تم تعديل الحجم بمعامل ${tailScale.toFixed(2)} ليصبح ${scaledSize.toFixed(3)} (الوضع: ${tailMode})`, 'RISK');
            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).tailRiskScale = tailScale;
                    (trace.executionDecision as any).tailRiskMode = tailMode;
                }
            }
        }

        // --- EXECUTION STYLE OVERLAY ---
        const styleContext = {
            signalQualityScore: analysis?.qualityScore || signalToSend.score || 0,
            volatilityRegime: analysis?.regime || 'UNKNOWN',
            stressScenarioEnabled: (stressScenarioService as any).isStressScenarioEnabled ? (stressScenarioService as any).isStressScenarioEnabled() : false,
            tailRiskMode: tailMode || 'NORMAL',
            drawdownMode: typeof drawdownMode !== 'undefined' ? drawdownMode : 'NORMAL'
        };

        const executionStyle = executionStyleService.decideStyle(styleContext);
        
        // Ensure executionStyle property exists on the signal, TS won't complain if cast to any
        (signalToSend as any).executionStyle = executionStyle;
        
        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).executionStyle = executionStyle;
            }
        }
        
        this.addLog(`⚙️ [EXECUTION STYLE] نمط التنفيذ المختار: ${executionStyle}`, 'EXEC');

        // --- PRE-TRADE RISK GUARD ---
const isRiskReducing = !['ENTRY', 'HEDGE', 'FLIP'].includes(actionType as string);
        const candidate = {
            symbol: signalToSend.asset || 'UNKNOWN',
            side: actionType as string,
            size: executedLotSize,
            notional: executedLotSize * (signalToSend.entry || 0),
            price: signalToSend.entry || 0,
            referencePrice: signalToSend.entry || 0,
            timestamp: Date.now(),
            isRiskReducing: isRiskReducing
        };
        const context = {
            lastMarketDataTs: analysis?.timestamp || Date.now()
        };
        const riskResult = preTradeRiskGuard.evaluate(candidate, context);
        if (!riskResult.allowed) {
            executionDecisionTraceService.recordPreTrade(false, riskResult.reason, riskResult.decisionCode);
            executionDecisionTraceService.recordBlock('PRE_TRADE', riskResult.reason || 'Blocked by PreTradeRiskGuard');
            this.addLog(`⛔ [PRE-TRADE BLOCKED] تم منع تنفيذ الصفقة قبل الإرسال: ${riskResult.reason}`, 'SYSTEM');
            diagnosticsService.recordPreTradeBlocked(riskResult.decisionCode, riskResult.reason || 'Unknown');
            return false;
        }


        // --- SMART ORDER ROUTING STUB ---
        const routingContext = {
            symbol: signalToSend.asset || 'UNKNOWN',
            instrumentType: (signalToSend.asset && !signalToSend.asset.includes('PERP')) ? 'EQUITY' : 'CRYPTO', // Basic heuristic
            notional: executedLotSize * (signalToSend.entry || 0),
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            liquidityTier: (signalToSend.asset && signalToSend.asset.includes('BTC')) ? 'HIGH' : 'MEDIUM'
        };
        const routeHint = smartOrderRouterService.decideRoute(routingContext as any);
        (signalToSend as any).routeHint = routeHint;
        
        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).routeHint = routeHint;
            }
        }
        
        this.addLog(`🛤️ [ROUTING] مسار التنفيذ المختار: ${routeHint}`, 'EXEC');

        // --- CHILD ORDER SCHEDULING STUB ---
        const parentOrder = {
            symbol: signalToSend.asset || 'UNKNOWN',
            strategy: signalToSend.strategy || 'UNKNOWN',
            side: (signalToSend.direction === 'LONG' || actionType === 'ENTRY') ? 'BUY' : 'SELL' as 'BUY'|'SELL',
            totalSize: executedLotSize,
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            routeHint: routeHint as any
        };
        const childOrders = childOrderSchedulerService.schedule(parentOrder);
        const timingPlanSummary = childOrderTimingOverlayService.applyTiming(childOrders);
        (signalToSend as any).childOrders = childOrders;

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).childOrdersSummary = {
                    totalSlices: childOrders.length,
                    sizes: childOrders.map(c => c.size)
                };
            }
        }

        executionDecisionTraceService.recordPreTrade(true);
        let allSuccess = true;
        const childTcaInputs: ChildExecutionTcaInput[] = [];
        for (const child of childOrders) {
            const childSignal = { ...signalToSend };
            // Update the size for this specific child
            (childSignal as any).size = child.size;
            
            // Attach slice metadata
            (childSignal as any).childOrder = child;
            (childSignal as any).sliceIndex = child.sliceIndex;
            (childSignal as any).totalSlices = child.totalSlices;
            (childSignal as any).executionStyle = child.executionStyle;
            (childSignal as any).routeHint = child.routeHint;
            (childSignal as any).dispatchMode = child.dispatchMode;
            (childSignal as any).timingPolicy = child.timingPolicy;
            (childSignal as any).intervalMs = child.intervalMs;
            (childSignal as any).scheduledAtOffsetMs = child.scheduledAtOffsetMs;

            // --- EXECUTION ANALYTICS STUB (PER CHILD) ---
            const analyticsInput = {
                symbol: child.symbol || 'UNKNOWN',
                strategy: child.strategy || 'UNKNOWN',
                side: child.side,
                requestedSize: child.size,
                executedSize: child.size,
                requestedPrice: childSignal.entry,
                executedPrice: childSignal.entry, // Placeholder assumption
                timestamp: new Date().toISOString(),
                executionStyle: child.executionStyle,
                routeHint: child.routeHint
            };
            const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
            (childSignal as any).executionAnalytics = analyticsSnapshot;
            childTcaInputs.push({
                requestedSize: analyticsInput.requestedSize,
                executedSize: analyticsInput.executedSize,
                requestedPrice: analyticsInput.requestedPrice,
                executedPrice: analyticsInput.executedPrice,
                fillRatio: analyticsSnapshot.fillRatio,
                slippage: analyticsSnapshot.slippage,
                slippageBps: analyticsSnapshot.slippageBps,
                notionalExecuted: analyticsSnapshot.notionalExecuted,
                sliceIndex: child.sliceIndex,
                totalSlices: child.totalSlices
            });

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    if (!(trace.executionDecision as any).childDispatches) {
                        (trace.executionDecision as any).childDispatches = [];
                    }
                    (trace.executionDecision as any).childDispatches.push({
                        sliceIndex: child.sliceIndex,
                        totalSlices: child.totalSlices,
                        childSize: child.size,
                        executionStyle: child.executionStyle,
                        routeHint: child.routeHint,
                        analytics: analyticsSnapshot,
                        dispatchMode: child.dispatchMode,
                        timingPolicy: child.timingPolicy,
                        intervalMs: child.intervalMs,
                        scheduledAtOffsetMs: child.scheduledAtOffsetMs
                    });
                    
                    // Keep the parent level executionAnalytics for backward compatibility with tests
                    if (child.sliceIndex === 0) {
                        (trace.executionDecision as any).executionAnalytics = analyticsSnapshot;
                    }
                }
            }

            try {
                const result = await sendToWebhook(
                    childSignal,
                    this.config.webhookUrl,
                    this.config.maxAllocationPerTradePercent,
                    actionType,
                    child.size,
                    this.config.webhookSecret,
                    this.config.forceClosePnL
                );

                if (result.success) {
                    strategyRiskBudgetService.registerAllocation(strategyName, child.size);
                    riskLimitsService.registerExecutedOrder(
                        childSignal.asset || 'UNKNOWN',
                        actionType as string,
                        child.size,
                        child.size * (childSignal.entry || 0),
                        isRiskReducing
                    );
                    this.addLog(`🚀 تم تنفيذ جزء: ${actionType} لـ ${childSignal.asset || 'System'} (${child.sliceIndex + 1}/${child.totalSlices})`, 'EXEC');
                    executionDecisionTraceService.recordDispatch();
                    if (this.config.enableTelegramAlerts && this.config.telegramBotToken) {
                        this.sendAlerts(childSignal, actionType, crlState);
                    }
                } else {
                    allSuccess = false;
                }
            } catch (err) {
                this.addLog(`خطأ في الوصول للجسر`, 'ERROR');
                allSuccess = false;
            }
        }

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;

                // Monitor execution quality
                const monitorResult = executionQualityMonitorService.evaluate(trace.executionDecision);
                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;

                // Post-Trade Reporting
                const postTradeReport = postTradeExecutionReportService.generateReport(trace.executionDecision);
                (trace.executionDecision as any).postTradeExecutionReport = postTradeReport;
            }
        }
        return allSuccess;
        } finally {
            executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
        }
    }

    private async sendAlerts(signal: TradingSignal, actionType: string, crlState: any = null) {
        try {
            const extraMsg = `
                Max Alloc: ${this.config.maxAllocationPerTradePercent}%
                Fixed Lot BTC: ${this.config.fixedLotSizeBTC} ETH: ${this.config.fixedLotSizeETH}
                Force Close PnL: $${this.config.forceClosePnL}
            `.trim();
            
            await sendSignalToTelegram(signal, this.config.telegramChatId, this.config.telegramBotToken, actionType, extraMsg, this.config.webhookUrl, crlState);
        } catch (err) {
            this.addLog(`خطأ في إرسال تنبيهات التليجرام: ${err}`, 'ERROR');
        }
    }
}
