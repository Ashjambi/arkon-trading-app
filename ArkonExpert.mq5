//+------------------------------------------------------------------+
//|                                                    Arkon50EA.mq5 |
//|                                      Copyright 2026, Arkon Quant |
//+------------------------------------------------------------------+
#property copyright "Arkon Quant"
#property link      "https://arkon.quant"
#property version   "50.00"

#include <Trade\Trade.mqh>

input string WebhookURL = "http://127.0.0.1:3000"; 
input string WebhookSecret = "ARKON_SECURE_2025";
input int PollingIntervalMs = 5000;  // Sync speed in milliseconds
input double TargetDollarProfit = 1.00; // Target TP (Activation for Trailing)
input bool   EnableSmartTrailing = true;  // Enable Smart Trailing TP
input double TrailingDropUSD = 0.25;      // Trailing Drop in USD (e.g. 0.25$)
input int MaxGlobalPositions = 100; // Maximum allowed open positions

//--- CAPITAL RECOVERY LAYER (CRL) PARAMETERS
input string      CRL_Header_Marker        = "===================="; // ==== Capital Recovery Layer ====
input bool        EnableCapitalRecovery    = true;     // Enable Smart Capital Recovery (CRL)
input double      CRLProfitAllocationPct   = 40.0;     // Closed profit budget allocated (30%-50%)
input double      CRLIncrementThreshold    = 100.0;    // Profit increment required to trigger CRL
input bool        ResetPersistentBaseline  = false;    // Reset saved baseline to 0 on startup

//--- GLOBAL STATE VARIABLES
struct TrailingState {
    ulong ticket;
    double maxProfit;
};
TrailingState g_trailingStates[2000];

void UpdateMaxProfit(ulong ticket, double currentProfit) {
    for(int i = 0; i < 2000; i++) {
        if(g_trailingStates[i].ticket == ticket) {
            if(currentProfit > g_trailingStates[i].maxProfit) {
                g_trailingStates[i].maxProfit = currentProfit;
            }
            return;
        }
        if(g_trailingStates[i].ticket == 0) {
            g_trailingStates[i].ticket = ticket;
            g_trailingStates[i].maxProfit = currentProfit;
            return;
        }
    }
}
double GetMaxProfit(ulong ticket) {
    for(int i = 0; i < 2000; i++) {
        if(g_trailingStates[i].ticket == ticket) return g_trailingStates[i].maxProfit;
        if(g_trailingStates[i].ticket == 0) return 0.0;
    }
    return 0.0;
}
void CleanTrailingStates() {
    for(int i = 0; i < 2000; i++) {
        if(g_trailingStates[i].ticket != 0) {
            if(!PositionSelectByTicket(g_trailingStates[i].ticket)) {
                g_trailingStates[i].ticket = 0;
                g_trailingStates[i].maxProfit = 0.0;
            }
        }
    }
}

string g_WebhookURL;
CTrade trade;
bool g_IsZombieBuy = false;   // Flag to halt Buy grid/cooling reinforcements
bool g_IsZombieSell = false;  // Flag to halt Sell grid/cooling reinforcements
double g_AccumulatedClosedProfit = 0.0; // Tracks closed profits allocated for compression
double g_CurrentClosedProfit = 0.0;     // Tracks current actual history profit
bool g_BaselineInitialized = false;     // Tracks whether baseline has been loaded/set on session startup
double g_CapitalReleased = 0.0;
double g_MarginSaved = 0.0;
int g_TotalCompressionCycles = 0;

int OnInit() {
    g_WebhookURL = WebhookURL;
    StringTrimLeft(g_WebhookURL);
    StringTrimRight(g_WebhookURL);
    if(StringSubstr(g_WebhookURL, StringLen(g_WebhookURL)-1, 1) == "/") g_WebhookURL = StringSubstr(g_WebhookURL, 0, StringLen(g_WebhookURL)-1);
    
    // STRICT FIX: High deviation to prevent Requotes/Slippage rejections
    trade.SetDeviationInPoints(9999); 
    trade.SetExpertMagicNumber(1337);

    MathSrand(GetTickCount());
    EventSetMillisecondTimer(PollingIntervalMs);
    Print("==========================================================");
    Print("ARKON EA Initialized. VERSION 50.00 (NATIVE 0.50$ TP)");
    Print("Target USD TP configured at: $" + DoubleToString(TargetDollarProfit, 2));
    Print("==========================================================");
    return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }


void UpdateDashboard() {
    string dashboard = "=== ARKON EXPERT v50.00 ===\n";
    dashboard += "Target EA TP: $" + DoubleToString(TargetDollarProfit, 2) + (EnableSmartTrailing ? " (Trailing)" : " (Hard)") + "\n";
    if (EnableSmartTrailing) {
        dashboard += "Trailing Drop: $" + DoubleToString(TrailingDropUSD, 2) + "\n";
    }
    dashboard += "Account Balance: $" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "\n";
    dashboard += "Account Equity: $" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "\n";
    
    int openPositions = PositionsTotal();
    dashboard += "Open Positions: " + IntegerToString(openPositions) + "\n";
    
    if (EnableCapitalRecovery) {
        dashboard += "\n--- CAPITAL RECOVERY (CRL) ---\n";
        dashboard += "Baseline Profit: $" + DoubleToString(g_AccumulatedClosedProfit, 2) + "\n";
        dashboard += "Current History: $" + DoubleToString(g_CurrentClosedProfit, 2) + "\n";
        
        double diff = g_CurrentClosedProfit - g_AccumulatedClosedProfit;
        double budgetEst = (diff > 0) ? (diff * (CRLProfitAllocationPct / 100.0)) : 0.0;
        
        dashboard += "Growth: $" + DoubleToString(diff, 2) + " (Threshold: $" + DoubleToString(CRLIncrementThreshold, 2) + ")\n";
        dashboard += "Available Budget: $" + DoubleToString(budgetEst, 2) + "\n";
    }
    
    Comment(dashboard);
}

void OnTick() {
    ManageLocalTrades();
    if(EnableCapitalRecovery) ManageCapitalRecovery();
    UpdateDashboard();
}

void OnTimer() { 
    ManageLocalTrades();
    if(EnableCapitalRecovery) ManageCapitalRecovery();
    SendState();
    UpdateDashboard();
}

void ManageCapitalRecovery() {
    // 1. Calculate closed profits from history to determine available budget
    if(HistorySelect(0, TimeCurrent())) {
        int totalDeals = HistoryDealsTotal();
        if(totalDeals <= 0) {
            // History cache is empty or not loaded yet. Skip to avoid premature baseline resets.
            return;
        }
        
        double currentClosedProfit = 0.0;
        int tradingDealsCount = 0;
        for(int d = 0; d < totalDeals; d++) {
            ulong deal_ticket = HistoryDealGetTicket(d);
            if(deal_ticket > 0) {
                long type = HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
                if(type == DEAL_TYPE_BUY || type == DEAL_TYPE_SELL) {
                    double pnl = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
                    double commission = HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
                    double swap = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
                    currentClosedProfit += (pnl + commission + swap);
                    tradingDealsCount++;
                }
            }
        }
        
        g_CurrentClosedProfit = currentClosedProfit;

        if(tradingDealsCount <= 0) {
            // No trading activity yet to calculate baseline
            return;
        }
        
        string gvName = "Arkon_AccumClosedProfit_1337";
        
        if(ResetPersistentBaseline) {
            GlobalVariableDel(gvName);
            Print("🔄 PERSISTENT RESET: Deleted saved persistent baseline.");
        }

        if(!g_BaselineInitialized) {
            g_BaselineInitialized = true;
            if(GlobalVariableCheck(gvName) && !ResetPersistentBaseline) {
                g_AccumulatedClosedProfit = GlobalVariableGet(gvName);
                Print("💾 PERSISTENT LOAD: Loaded accumulated baseline: $", DoubleToString(g_AccumulatedClosedProfit, 2));
                
                // Keep safety in case baseline is corrupted or reset
                if(currentClosedProfit < g_AccumulatedClosedProfit) {
                    g_AccumulatedClosedProfit = currentClosedProfit;
                    GlobalVariableSet(gvName, g_AccumulatedClosedProfit);
                    Print("⚠️ Baseline was larger than current history, auto-reset to: $", DoubleToString(g_AccumulatedClosedProfit, 2));
                }
            } else {
                g_AccumulatedClosedProfit = currentClosedProfit; // Initial baseline setting on startup
                GlobalVariableSet(gvName, g_AccumulatedClosedProfit);
                Print("💾 PERSISTENT CREATED: Baseline initiated at current all-time profit: $", DoubleToString(g_AccumulatedClosedProfit, 2));
            }
        }
        else if(currentClosedProfit > g_AccumulatedClosedProfit) {
            double profitDifference = currentClosedProfit - g_AccumulatedClosedProfit;
            if(profitDifference >= CRLIncrementThreshold) {
                // Increment threshold reached! Trigger smart compression cycle
                if(ExecuteCompressionCycle(profitDifference)) {
                    g_AccumulatedClosedProfit = currentClosedProfit;
                    GlobalVariableSet(gvName, g_AccumulatedClosedProfit);
                    Print("✅ PERSISTENT SAVE: Compression cycle succeeded. New baseline: $", DoubleToString(g_AccumulatedClosedProfit, 2));
                }
            }
        }
    }

    // 2. Scan active baskets to compute scoring metrics & identify Zombie status
    double buyFloatingPnL = 0, sellFloatingPnL = 0;
    double buyVolume = 0, sellVolume = 0;
    int buyCount = 0, sellCount = 0;
    
    
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        
        double profit = PositionGetDouble(POSITION_PROFIT);
        long type = PositionGetInteger(POSITION_TYPE);
        double volume = PositionGetDouble(POSITION_VOLUME);
        
        if(type == POSITION_TYPE_BUY) {
            buyFloatingPnL += profit;
            buyVolume += volume;
            buyCount++;
        } else {
            sellFloatingPnL += profit;
            sellVolume += volume;
            sellCount++;
        }
    }
    
    // Dynamic Zombie Basket criteria based on account balance percentage (e.g. 10%)
    double acctBalance = AccountInfoDouble(ACCOUNT_BALANCE);
    double maxDrawdownAllowance = acctBalance * 0.10; // 10% of balance instead of fixed $2000
    if (maxDrawdownAllowance < 500.0) maxDrawdownAllowance = 500.0; // Failsafe floor

    g_IsZombieBuy = (buyCount >= 5 && buyFloatingPnL < -maxDrawdownAllowance);
    g_IsZombieSell = (sellCount >= 5 && sellFloatingPnL < -maxDrawdownAllowance);
    
}

bool ExecuteCompressionCycle(double profitIncremental) {
    double budget = profitIncremental * (CRLProfitAllocationPct / 100.0);
    if(budget <= 0) return false;
    
    // Safety check: Count total losing positions first
    int totalLosingPositions = 0;
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        double profit = PositionGetDouble(POSITION_PROFIT);
        if(profit < 0) totalLosingPositions++;
    }
    
    if(totalLosingPositions == 0) {
        Print("ℹ️ CRL Scan: No losing positions found in the account to recover. Moving baseline up.");
        return true;
    }
    
    double remaining_budget = budget;
    bool closed_any = false;
    
    Print("🔍 Scanning positions for CRL compression. Available Budget: $", DoubleToString(budget, 2), " (Oldest-First Mode)");
    
    // Loop to continuously process any losing positions that fit the remaining budget, prioritized by age (oldest to newest)
    while(remaining_budget > 0) {
        ulong bestTicket = 0;
        double bestLoss = 0.0;
        string bestSymbol = "";
        datetime oldestTime = 0; // Will be set to the oldest time found
        
        for(int i = PositionsTotal() - 1; i >= 0; i--) {
            ulong ticket = PositionGetTicket(i);
            if(ticket <= 0) continue;
            
            double rawProfit = PositionGetDouble(POSITION_PROFIT);
            double swap = PositionGetDouble(POSITION_SWAP);
            double profit = rawProfit + swap; // Using net profit
            
            if(profit >= 0) continue; // Skip profitable positions
            
            datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
            string symbol = PositionGetString(POSITION_SYMBOL);
            
            // Check if absolute loss is within remaining budget
            if(MathAbs(profit) <= remaining_budget) {
                // Select the single oldest loss that fits inside the current remaining budget
                if(bestTicket == 0 || openTime < oldestTime) {
                    oldestTime = openTime;
                    bestLoss = profit;
                    bestTicket = ticket;
                    bestSymbol = symbol;
                }
            }
        }
        
        // If we found an eligible trade, close it and deduct from budget
        if(bestTicket > 0 && bestSymbol != "") {
            Print("⚔️ CRL Full Close Triggered (Oldest Loss in budget)! Ticket: ", bestTicket, " | Loss: $", DoubleToString(bestLoss, 2), " | Remaining budget: $", DoubleToString(remaining_budget, 2));
            
            trade.SetDeviationInPoints(9999);
            trade.SetExpertMagicNumber(0);
            
            if(trade.PositionClose(bestTicket)) {
                g_CapitalReleased += MathAbs(bestLoss);
                g_TotalCompressionCycles++;
                remaining_budget -= MathAbs(bestLoss);
                closed_any = true;
                Print("✅ CRL Full Close SUCCESS! Trade removed. New remaining budget: $", DoubleToString(remaining_budget, 2));
            } else {
                Print("❌ CRL Full Close Failed! Ticket: ", bestTicket, " Retcode: ", trade.ResultRetcode(), " Desc: ", trade.ResultRetcodeDescription());
                // Break loop if a close fails to avoid infinite loops on broker rejection
                break;
            }
        } else {
            // No more trades fit inside the remaining budget
            break;
        }
    }
    
    // Let's identify the deepest oldest loss that exceeds our remaining budget
    ulong type3Ticket = 0;
    double type3Loss = 0.0;
    string type3Symbol = "";
    datetime type3OldestTime = 0;
    
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        
        double rawProfit = PositionGetDouble(POSITION_PROFIT);
        double swap = PositionGetDouble(POSITION_SWAP);
        double profit = rawProfit + swap; // Using net profit
        
        if(profit >= 0) continue;
        
        datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
        string symbol = PositionGetString(POSITION_SYMBOL);
        
        if(MathAbs(profit) > remaining_budget) {
            if(type3Ticket == 0 || openTime < type3OldestTime) {
                type3OldestTime = openTime;
                type3Loss = profit;
                type3Ticket = ticket;
                type3Symbol = symbol;
            }
        }
    }
    
    if(type3Ticket > 0) {
        Print("ℹ️ CRL Queue (Type 3 - Exceeds budget): Ticket: ", type3Ticket, " | Symbol: ", type3Symbol, " | Loss: $", DoubleToString(-type3Loss, 2), " | Remaining Budget: $", DoubleToString(remaining_budget, 2), " | Need: $", DoubleToString(-type3Loss - remaining_budget, 2), " more in budget. Waiting for closed profit to grow to close fully.");
    }
    
    if(closed_any) {
        Print("ℹ️ CRL Scan completed successfully. One or more old positions were processed.");
        return true;
    }
    
    Print("ℹ️ CRL Scan completed. No eligible old targets (Type 1 or Type 3) were processed in this cycle.");
    return false;
}

void ManageLocalTrades() {
    CleanTrailingStates();
    if (TargetDollarProfit <= 0) return;
    
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        
        double profit = PositionGetDouble(POSITION_PROFIT);
        double swap = PositionGetDouble(POSITION_SWAP);
        double commission = 0;
        
        if(HistorySelectByPosition(ticket)) {
            int deals = HistoryDealsTotal();
            for(int d = 0; d < deals; d++) {
                ulong deal_ticket = HistoryDealGetTicket(d);
                if(deal_ticket > 0) commission += HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
            }
        }
        
        double netProfit = profit + swap + commission;
        
        // Native local close!
        if (netProfit >= TargetDollarProfit) {
            Print("Local EA TP Hit! Profit: ", netProfit, " >= ", TargetDollarProfit, ". Closing ticket ", ticket);
            trade.SetDeviationInPoints(9999);
            trade.SetExpertMagicNumber(0);
            trade.PositionClose(ticket);
        }
    }
}

void SendState() {
    string positionsJson = "[";
    bool first = true;
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        
        if(!first) positionsJson += ",";
        first = false;
        
        string symbol = PositionGetString(POSITION_SYMBOL);
        double volume = PositionGetDouble(POSITION_VOLUME);
        double profit = PositionGetDouble(POSITION_PROFIT);
        double swap = PositionGetDouble(POSITION_SWAP);
        
        double commission = 0;
        if(HistorySelectByPosition(ticket)) {
            int deals = HistoryDealsTotal();
            for(int d = 0; d < deals; d++) {
                ulong deal_ticket = HistoryDealGetTicket(d);
                if(deal_ticket > 0) commission += HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
            }
        }
        
        double netProfit = profit + swap + commission;
        
        double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
        double currentPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
        double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
        double profitPoints = 0;
        
        string direction = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "LONG" : "SHORT";
        if(point > 0) {
            if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
                profitPoints = (currentPrice - openPrice) / point;
            else
                profitPoints = (openPrice - currentPrice) / point;
        }
        
        // Output with max precision
        positionsJson += "{\"ticket\":" + (string)ticket + ",\"symbol\":\"" + symbol + "\",\"direction\":\"" + direction + "\",\"volume\":" + DoubleToString(volume, 3) + ",\"openPrice\":" + DoubleToString(openPrice, 5) + ",\"currentPrice\":" + DoubleToString(currentPrice, 5) + ",\"profitPoints\":" + DoubleToString(profitPoints, 2) + ",\"pnl\":" + DoubleToString(netProfit, 5) + ",\"gross\":" + DoubleToString(profit, 5) + "}";
    }
    positionsJson += "]";
    
    char post[], result[]; string result_headers;
    string url = g_WebhookURL + "/api/mt5/sync";
    string headers = "Content-Type: application/json\r\nUser-Agent: MetaTrader 5\r\n";
    double diff = g_CurrentClosedProfit - g_AccumulatedClosedProfit;
    double budgetEst = (diff > 0) ? (diff * (CRLProfitAllocationPct / 100.0)) : 0.0;
    string payload = "{\"positions\":" + positionsJson + ",\"crl_baseline\":" + DoubleToString(g_AccumulatedClosedProfit, 2) + ",\"crl_current\":" + DoubleToString(g_CurrentClosedProfit, 2) + ",\"crl_diff\":" + DoubleToString(diff, 2) + ",\"crl_budget\":" + DoubleToString(budgetEst, 2) + ",\"crl_threshold\":" + DoubleToString(CRLIncrementThreshold, 2) + "}";
    StringToCharArray(payload, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, StringLen(payload));
    
    ResetLastError();
    int res = WebRequest("POST", url, headers, 10000, post, result, result_headers);
    if(res == 200) {
        string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
        if(StringLen(response) > 10 && StringFind(response, "action") < 0 && StringFind(response, "<html") >= 0) {
            Print("🚨 CRITICAL ERROR: Webhook URL returned an HTML page!");
            return;
        }
        if(StringFind(response, "action") >= 0) {
            Print("🚨 SIGNAL RECEIVED via SYNC - RAW JSON: ", response);
            ProcessSignal(response);
        }
    } else {
        if(res == -1) {
            int err = GetLastError();
            if(err == 4060 || err == 4014) {
                Print("🚨 4014 ERR_FUNCTION_NOT_ALLOWED: WebRequest blocked!");
            } else {
                Print("❌ WebRequest Failed! Error: ", err, " | URL: ", url);
            }
        } else {
            Print("❌ Bridge Connection Error during SendState. HTTP Code: ", res);
        }
    }
}


string ResolveSymbol(string baseSymbol) {
    if(SymbolSelect(baseSymbol, true)) return baseSymbol;
    if(SymbolSelect(baseSymbol+"USD", true)) return baseSymbol+"USD";
    if(SymbolSelect(baseSymbol+"m", true)) return baseSymbol+"m";
    if(SymbolSelect(baseSymbol+".pro", true)) return baseSymbol+".pro";
    if(SymbolSelect(baseSymbol+".a", true)) return baseSymbol+".a";
    
    int total = SymbolsTotal(true);
    string upperBase = baseSymbol;
    StringToUpper(upperBase);
    
    for(int i=0; i<total; i++) {
        string s = SymbolName(i, true);
        string upperS = s;
        StringToUpper(upperS);
        // Find best match (e.g. BTCUSD matching BTCUSD.c)
        if(StringFind(upperS, upperBase) >= 0) {
            SymbolSelect(s, true);
            return s;
        }
    }
    return baseSymbol; // Return unchanged if not found, let execution fail natively
}

void ForceCloseAllMatching(long ticket, string symbolToClose) {
    bool closedAny = false;
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong posTicket = PositionGetTicket(i);
        string posSymbol = PositionGetSymbol(i);
        
        bool isMatch = false;
        if (ticket > 0) {
            if (posTicket == (ulong)ticket) isMatch = true;
        } else if (StringLen(symbolToClose) > 0) {
            if (StringFind(posSymbol, symbolToClose) >= 0) isMatch = true;
        }
        
        if(isMatch) {
            // Force strict market order to bypass CTrade deviation bugs
            trade.SetDeviationInPoints(9999);
            trade.SetExpertMagicNumber(0); // Ignore magic number requirement for closing
            
            bool result = trade.PositionClose(posTicket);
            if(result) {
                Print("Centralized Exit: FORCE CLOSE executed! Ticket: ", posTicket);
                closedAny = true;
            } else {
                Print("Centralized Exit: FAILED FORCE CLOSE! Ticket: ", posTicket, " Retcode: ", trade.ResultRetcode(), " Desc: ", trade.ResultRetcodeDescription());
                // Fallback attempt with opposite order
                long type = PositionGetInteger(POSITION_TYPE);
                double vol = PositionGetDouble(POSITION_VOLUME);
                string slType = (type == POSITION_TYPE_BUY) ? "SELL" : "BUY";
                Print("Attempting fallback direct standard hedge order to close: ", slType, " Vol: ", vol);
                
                if (type == POSITION_TYPE_BUY) {
                    if(trade.Sell(vol, posSymbol, 0, 0, 0, "ARKON FORCE CLOSE")) closedAny = true;
                } else {
                    if(trade.Buy(vol, posSymbol, 0, 0, 0, "ARKON FORCE CLOSE")) closedAny = true;
                }
            }
        }
    }
    if(!closedAny) Print("Centralized Exit: Zero positions matched for forced closure. Ticket: ", ticket, " Symbol: ", symbolToClose);
}

void ProcessSignal(string json) {
    string action = ExtractJSONString(json, "action_type");
    if(StringLen(action) == 0) action = ExtractJSONString(json, "action");
    
    if(action == "CLOSE") {
        long ticket = ExtractJSONLong(json, "ticket");
        string symbolToClose = ExtractJSONString(json, "symbol");
        Print("Processing CLOSE ticket: ", ticket, " symbol: ", symbolToClose);
        ForceCloseAllMatching(ticket, symbolToClose);
        return;
    }

    string rawSymbol = ExtractJSONString(json, "symbol");
    if(StringLen(rawSymbol) == 0) rawSymbol = ExtractJSONString(json, "original_symbol");
    string direction = ExtractJSONString(json, "direction");
    double lotSize = ExtractJSONDouble(json, "fixedLotSize");
    double sl = ExtractJSONDouble(json, "stopLoss");
    if(lotSize < 0.01) lotSize = 0.01; // FAILSAFE: minimum volume fallback
    
    // --- EQUITY-BASED LOT SCALING SYSTEM ---
    // For every $1000 increment in equity, increase the lot size:
    // Bitcoin (BTC): +0.01
    // Ethereum (ETH): +0.1
    double curEquity = AccountInfoDouble(ACCOUNT_EQUITY);
    int increments = (int)MathFloor(curEquity / 1000.0) - 1;
    if(increments < 0) increments = 0;
    
    double scaledLot = lotSize;
    if(StringFind(rawSymbol, "BTC") >= 0) {
        scaledLot = lotSize + (increments * 0.01);
        Print("📈 Dynamic Lot Scaler [BTC]: Base Lot = ", DoubleToString(lotSize, 2), " | Equity = $", DoubleToString(curEquity, 2), " | Scaled Lot = ", DoubleToString(scaledLot, 2));
    } else if(StringFind(rawSymbol, "ETH") >= 0) {
        scaledLot = lotSize + (increments * 0.1);
        Print("📈 Dynamic Lot Scaler [ETH]: Base Lot = ", DoubleToString(lotSize, 2), " | Equity = $", DoubleToString(curEquity, 2), " | Scaled Lot = ", DoubleToString(scaledLot, 2));
    }
    lotSize = scaledLot;
    if (lotSize > 1.0) {
        lotSize = 1.0;
        Print("⚠️ Dynamic Lot Scaler capped to MAX 1.0 lots.");
    }
    
    string resolvedSymbol = ResolveSymbol(rawSymbol);
    if(!SymbolSelect(resolvedSymbol, true)) {
        Print("Centralized Entry: Failed to resolve symbol matching ", rawSymbol);
        return;
    }
    
    // Normalize lot size
    double minVol = SymbolInfoDouble(resolvedSymbol, SYMBOL_VOLUME_MIN);
    double maxVol = SymbolInfoDouble(resolvedSymbol, SYMBOL_VOLUME_MAX);
    double stepVol = SymbolInfoDouble(resolvedSymbol, SYMBOL_VOLUME_STEP);
    if(minVol <= 0) minVol = 0.01;
    if(maxVol <= 0) maxVol = 1000.0;
    if(stepVol <= 0) stepVol = 0.01;

    if (lotSize < minVol) lotSize = minVol;
    if (lotSize > maxVol) lotSize = maxVol;
    lotSize = MathRound(lotSize / stepVol) * stepVol; // Round to step

    if(action == "ENTRY" || action == "HEDGE" || action == "FLIP") {
        if(direction == "LONG" && g_IsZombieBuy) {
            Print("⏩ BLOCK ENTRY: Buy Basket has been designated as a Zombie Basket! Grid reinforcement blocked.");
            return;
        }
        if(direction == "SHORT" && g_IsZombieSell) {
            Print("⏩ BLOCK ENTRY: Sell Basket has been designated as a Zombie Basket! Grid reinforcement blocked.");
            return;
        }
        
        if(PositionsTotal() >= MaxGlobalPositions) {
            Print("⏩ SKIPPED 3: Max Global Positions (", MaxGlobalPositions, ") reached!");
            return;
        }

        trade.SetDeviationInPoints(9999);
        
        // Handle FLIP (Reversal): Close all opposite positions first
        if(action == "FLIP") {
            for(int i = PositionsTotal() - 1; i >= 0; i--) {
                ulong pTicket = PositionGetTicket(i);
                if(PositionGetString(POSITION_SYMBOL) == resolvedSymbol) {
                    long type = PositionGetInteger(POSITION_TYPE);
                    if((direction == "LONG" && type == POSITION_TYPE_SELL) || 
                       (direction == "SHORT" && type == POSITION_TYPE_BUY)) {
                        Print("FLIP Action: Closing opposite position ", pTicket);
                        trade.PositionClose(pTicket);
                    }
                }
            }
        }
        
        // MT5 Crypto/Prop firm compatibility: Retry with IOC if FOK fails
        trade.SetTypeFilling(ORDER_FILLING_FOK);
        
        if(direction == "LONG") {
            if(!trade.Buy(lotSize, resolvedSymbol, 0, sl, 0, action)) {
                Print(action + " FAILED (FOK): ", trade.ResultRetcodeDescription(), ". Retrying with IOC...");
                trade.SetTypeFilling(ORDER_FILLING_IOC);
                if(!trade.Buy(lotSize, resolvedSymbol, 0, sl, 0, action)) {
                    Print(action + " FAILED (IOC): ", trade.ResultRetcodeDescription(), ". Retrying with RETURN...");
                    trade.SetTypeFilling(ORDER_FILLING_RETURN);
                    if(!trade.Buy(lotSize, resolvedSymbol, 0, sl, 0, action)) {
                        Print(action + " FAILED (RETURN): ", trade.ResultRetcodeDescription());
                    } else Print(action + " SUCCESS(RETURN): LONG ", resolvedSymbol);
                } else Print(action + " SUCCESS(IOC): LONG ", resolvedSymbol);
            } else Print(action + " SUCCESS(FOK): LONG ", resolvedSymbol);
        } else {
            if(!trade.Sell(lotSize, resolvedSymbol, 0, sl, 0, action)) {
                Print(action + " FAILED (FOK): ", trade.ResultRetcodeDescription(), ". Retrying with IOC...");
                trade.SetTypeFilling(ORDER_FILLING_IOC);
                if(!trade.Sell(lotSize, resolvedSymbol, 0, sl, 0, action)) {
                    Print(action + " FAILED (IOC): ", trade.ResultRetcodeDescription(), ". Retrying with RETURN...");
                    trade.SetTypeFilling(ORDER_FILLING_RETURN);
                    if(!trade.Sell(lotSize, resolvedSymbol, 0, sl, 0, action)) {
                        Print(action + " FAILED (RETURN): ", trade.ResultRetcodeDescription());
                    } else Print(action + " SUCCESS(RETURN): SHORT ", resolvedSymbol);
                } else Print(action + " SUCCESS(IOC): SHORT ", resolvedSymbol);
            } else Print(action + " SUCCESS(FOK): SHORT ", resolvedSymbol);
        }
    }
}

string ExtractJSONString(string json, string key) {
    string search1 = "\"" + key + "\":\"";
    string search2 = "\"" + key + "\": \"";
    int start = StringFind(json, search1);
    int offset = StringLen(search1);
    if(start < 0) { start = StringFind(json, search2); offset = StringLen(search2); }
    if(start < 0) return "";
    int quoteStart = start + offset;
    int quoteEnd = StringFind(json, "\"", quoteStart);
    if(quoteEnd < 0) return "";
    return StringSubstr(json, quoteStart, quoteEnd - quoteStart);
}

double ExtractJSONDouble(string json, string key) {
    string search1 = "\"" + key + "\":";
    string search2 = "\"" + key + "\": ";
    int start = StringFind(json, search1);
    int offset = StringLen(search1);
    if(start < 0) { start = StringFind(json, search2); offset = StringLen(search2); }
    if(start < 0) return 0.0;
    int valStart = start + offset;
    int endComma = StringFind(json, ",", valStart);
    int endBrace = StringFind(json, "}", valStart);
    int end = endComma;
    if(end < 0 || (endBrace > 0 && endBrace < end)) end = endBrace;
    if(end < 0) return 0.0;
    return StringToDouble(StringSubstr(json, valStart, end - valStart));
}

long ExtractJSONLong(string json, string key) {
    string search1 = "\"" + key + "\":";
    string search2 = "\"" + key + "\": ";
    int start = StringFind(json, search1);
    int offset = StringLen(search1);
    if(start < 0) { start = StringFind(json, search2); offset = StringLen(search2); }
    if(start < 0) return 0;
    int valStart = start + offset;
    int endComma = StringFind(json, ",", valStart);
    int endBrace = StringFind(json, "}", valStart);
    int end = endComma;
    if(end < 0 || (endBrace > 0 && endBrace < end)) end = endBrace;
    if(end < 0) return 0;
    return StringToInteger(StringSubstr(json, valStart, end - valStart));
}
