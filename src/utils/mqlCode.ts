export const getMQL5Code = (webhookUrl: string, webhookSecret: string, maxOpenTrades: number = 100) => `//+------------------------------------------------------------------+
//|                                                    Arkon51EA.mq5 |
//|                                      Copyright 2026, Arkon Quant |
//+------------------------------------------------------------------+
#property copyright "Arkon Quant"
#property link      "https://arkon.quant"
#property version   "51.00"

#include <Trade\\Trade.mqh>

input string WebhookURL = "${webhookUrl}"; 
input string WebhookSecret = "${webhookSecret}";
input int PollingIntervalMs = 5000;  // Sync speed in milliseconds
input double TargetDollarProfit = 1.00; // Target TP (Activation for Trailing)
input bool   EnableSmartTrailing = true;  // Enable Smart Trailing TP
input double TrailingDropUSD = 0.25;      // Trailing Drop in USD (e.g. 0.25$)
input int MaxGlobalPositions = ${maxOpenTrades}; // Maximum allowed open positions
input double HardPortfolioStopLossUSD = 250.0; // Panic Max Drawdown USD

//--- CAPITAL RECOVERY LAYER (CRL) PARAMETERS
input string      CRL_Header_Marker        = "===================="; // ==== Capital Recovery Layer ====
input bool        EnableCapitalRecovery    = true;     // Enable Smart Capital Recovery (CRL)
input double      CRLProfitAllocationPct   = 40.0;     // Closed profit budget allocated (30%-50%)
input double      CRLIncrementThreshold    = 100.0;    // Profit increment required to trigger CRL
input double      CRLMaxClosurePerCycle    = 100.0;    // Maximum wallet amount to spend per single compression cycle
input int         CRLMinAgeHours           = 48;       // Minimum age (in hours) for a losing trade to be eligible for CRL closure
input bool        ResetPersistentBaseline  = false;    // Reset saved baseline to 0 on startup

//--- GLOBAL STATE VARIABLES

struct TrailingState {
    ulong ticket;
    double maxProfit;
};
TrailingState g_trailingStates[2000];

struct PositionManagerState {
    ulong ticket;
    double entryPrice;
    double entryRV;
    double entryTime;
    double rvTrailDistance;
    bool initialized;
};
PositionManagerState g_positionManager[2000];

void RegisterPositionManagerState(ulong ticket, double entryPrice, double entryRV, double rvTrailDistance) {
    for(int i = 0; i < 2000; i++) {
        if(g_positionManager[i].ticket == ticket) {
            g_positionManager[i].entryPrice = entryPrice;
            g_positionManager[i].entryRV = entryRV;
            g_positionManager[i].entryTime = (double)TimeCurrent();
            g_positionManager[i].rvTrailDistance = rvTrailDistance;
            g_positionManager[i].initialized = true;
            return;
        }
        if(g_positionManager[i].ticket == 0) {
            g_positionManager[i].ticket = ticket;
            g_positionManager[i].entryPrice = entryPrice;
            g_positionManager[i].entryRV = entryRV;
            g_positionManager[i].entryTime = (double)TimeCurrent();
            g_positionManager[i].rvTrailDistance = rvTrailDistance;
            g_positionManager[i].initialized = true;
            return;
        }
    }
}

void UpdatePositionManagerState(ulong ticket, double currentPrice) {
    for(int i = 0; i < 2000; i++) {
        if(g_positionManager[i].ticket != ticket) continue;
        if(!g_positionManager[i].initialized) continue;
        double move = MathAbs(currentPrice - g_positionManager[i].entryPrice);
        double rvTrail = MathMax(0.0, g_positionManager[i].entryRV * 4.0);
        if(move >= rvTrail) {
            g_positionManager[i].rvTrailDistance = rvTrail;
        }
        break;
    }
}

void ApplyPositionManagerLogic(ulong ticket, string symbol) {
    if(ticket == 0) return;
    if(!PositionSelectByTicket(ticket)) return;
    long type = PositionGetInteger(POSITION_TYPE);
    double entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
    double currentPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
    double volume = PositionGetDouble(POSITION_VOLUME);
    double rv = MathMax(0.0001, MathAbs(SymbolInfoDouble(symbol, SYMBOL_POINT)) * 4.0);
    if(type == POSITION_TYPE_BUY) {
        double rMultiple = (currentPrice - entryPrice) / MathMax(rv, 0.0001);
        if(rMultiple >= 1.0 && volume > 0.0) {
            double partialVolume = MathMax(0.01, volume * 0.5);
            if(!trade.PositionClosePartial(ticket, partialVolume)) {
                trade.PositionClose(ticket);
            }
        }
    } else {
        double rMultiple = (entryPrice - currentPrice) / MathMax(rv, 0.0001);
        if(rMultiple >= 1.0 && volume > 0.0) {
            double partialVolume = MathMax(0.01, volume * 0.5);
            if(!trade.PositionClosePartial(ticket, partialVolume)) {
                trade.PositionClose(ticket);
            }
        }
    }
}

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
double g_VirtualRecoveryWallet = 0.0;   // The rolling budget available to close trades
double g_CurrentClosedProfit = 0.0;     // Tracks current actual history profit
double g_CycleSpentAmount = 0.0;        // Tracks the amount spent in the current cycle
datetime g_CycleStartTime = 0;          // Tracks when the current cycle started
bool g_BaselineInitialized = false;     // Tracks whether baseline has been loaded/set on session startup
double g_CapitalReleased = 0.0;
double g_MarginSaved = 0.0;
int g_TotalCompressionCycles = 0;
string g_LocalBridgeURL = "http://127.0.0.1:3000";

int OnInit() {
    g_WebhookURL = g_LocalBridgeURL;
    StringTrimLeft(g_WebhookURL);
    StringTrimRight(g_WebhookURL);
    if(StringSubstr(g_WebhookURL, StringLen(g_WebhookURL)-1, 1) == "/") g_WebhookURL = StringSubstr(g_WebhookURL, 0, StringLen(g_WebhookURL)-1);
    
    // STRICT FIX: High deviation to prevent Requotes/Slippage rejections
    trade.SetDeviationInPoints(9999); 
    trade.SetExpertMagicNumber(1337);

    MathSrand(GetTickCount());
    EventSetMillisecondTimer(PollingIntervalMs);
    Print("Bridge URL locked to local endpoint: ", g_WebhookURL);
    Print("==========================================================");
    Print("ARKON EA Initialized. VERSION 51.00 (NATIVE 0.50$ TP)");
    Print("Target USD TP configured at: $" + DoubleToString(TargetDollarProfit, 2));
    Print("==========================================================");
    return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }


void UpdateDashboard() {
    string dashboard = "=== ARKON EXPERT v50.00 ===\\n";
    dashboard += "Target EA TP: $" + DoubleToString(TargetDollarProfit, 2) + (EnableSmartTrailing ? " (Trailing)" : " (Hard)") + "\\n";
    if (EnableSmartTrailing) {
        dashboard += "Trailing Drop: $" + DoubleToString(TrailingDropUSD, 2) + "\\n";
    }
    dashboard += "Account Balance: $" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "\\n";
    dashboard += "Account Equity: $" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "\\n";
    
    int openPositions = PositionsTotal();
    dashboard += "Open Positions: " + IntegerToString(openPositions) + "\\n";
    
    if (EnableCapitalRecovery) {
        dashboard += "\\n--- CAPITAL RECOVERY (CRL) ---\\n";
        dashboard += "Baseline Profit: $" + DoubleToString(g_AccumulatedClosedProfit, 2) + "\\n";
        dashboard += "Current History: $" + DoubleToString(g_CurrentClosedProfit, 2) + "\\n";
        
        double diff = g_CurrentClosedProfit - g_AccumulatedClosedProfit;
        double budgetEst = (diff > 0) ? (diff * (CRLProfitAllocationPct / 100.0)) : 0.0;
        
        dashboard += "Growth: $" + DoubleToString(diff, 2) + " (Threshold: $" + DoubleToString(CRLIncrementThreshold, 2) + ")\\n";
        dashboard += "Available Budget: $" + DoubleToString(budgetEst, 2) + "\\n";
    }
    
    Comment(dashboard);
}

void OnTick() {
    ManageLocalTrades();
    // if(EnableCapitalRecovery) ManageCapitalRecovery(); // Disabled by request
}

void OnTimer() { 
    ManageLocalTrades();
    // if(EnableCapitalRecovery) ManageCapitalRecovery(); // Disabled by request
    SendState(); 
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
        string gvWallet = "Arkon_VirtualWallet_1337";
        
        if(ResetPersistentBaseline) {
            GlobalVariableDel(gvName);
            GlobalVariableDel(gvWallet);
            GlobalVariableDel("Arkon_CycleStart_1337");
            GlobalVariableDel("Arkon_CycleSpent_1337");
            Print("🔄 PERSISTENT RESET: Deleted saved persistent baseline and virtual wallet.");
        }

        if(!g_BaselineInitialized) {
            g_BaselineInitialized = true;
            if (GlobalVariableCheck(gvWallet)) {
                g_VirtualRecoveryWallet = GlobalVariableGet(gvWallet);
                Print("👛 PERSISTENT LOAD: Loaded virtual wallet: $", DoubleToString(g_VirtualRecoveryWallet, 2));
            }
            if (GlobalVariableCheck("Arkon_CycleStart_1337")) {
                g_CycleStartTime = (datetime)GlobalVariableGet("Arkon_CycleStart_1337");
            }
            if (GlobalVariableCheck("Arkon_CycleSpent_1337")) {
                g_CycleSpentAmount = GlobalVariableGet("Arkon_CycleSpent_1337");
            }
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
                // Chunk calculation: deal with every threshold (e.g. $100) separately
                int chunks = (int)(profitDifference / CRLIncrementThreshold);
                double allocatedProfitToExtract = chunks * CRLIncrementThreshold;
                
                // Calculate 40% (or whatever allocation) of the extracted chunks
                double addedBudget = allocatedProfitToExtract * (CRLProfitAllocationPct / 100.0);
                
                g_AccumulatedClosedProfit += allocatedProfitToExtract;
                GlobalVariableSet(gvName, g_AccumulatedClosedProfit);
                
                g_VirtualRecoveryWallet += addedBudget;
                GlobalVariableSet(gvWallet, g_VirtualRecoveryWallet);
                
                Print("✅ WALLET FUNDED: Extracted ", chunks, " chunk(s). Baseline moved up by $", DoubleToString(allocatedProfitToExtract, 2), 
                      ". Added $", DoubleToString(addedBudget, 2), " to wallet. Total Wallet: $", DoubleToString(g_VirtualRecoveryWallet, 2));
            }
        }
        else if(currentClosedProfit < g_AccumulatedClosedProfit) {
            // A loss was realized (either manually, via SL, or by CRL closing a trade).
            // We MUST adjust the baseline down to match the new lowered history.
            // Otherwise, the EA gets "stuck" trying to recover the loss before generating new budget.
            double diff = g_AccumulatedClosedProfit - currentClosedProfit;
            g_AccumulatedClosedProfit = currentClosedProfit;
            GlobalVariableSet(gvName, g_AccumulatedClosedProfit);
            Print("⚠️ Baseline adjusted DOWN by $", DoubleToString(diff, 2), " to match current history. New Baseline: $", DoubleToString(g_AccumulatedClosedProfit, 2));
        }
        
        // Always try to execute compression if we have funds in the virtual wallet
        if (g_VirtualRecoveryWallet > 0) {
            ExecuteCompressionCycle();
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

void ExecuteCompressionCycle() {
    // Check if the cycle window has expired (based on CRLMinAgeHours)
    int cycleDurationSeconds = CRLMinAgeHours * 3600;
    if (g_CycleStartTime == 0 || (TimeCurrent() - g_CycleStartTime) >= cycleDurationSeconds) {
        g_CycleStartTime = TimeCurrent();
        g_CycleSpentAmount = 0.0;
        GlobalVariableSet("Arkon_CycleStart_1337", (double)g_CycleStartTime);
        GlobalVariableSet("Arkon_CycleSpent_1337", g_CycleSpentAmount);
        Print("🔄 New CRL Compression Cycle Started! Limit resets to $", DoubleToString(CRLMaxClosurePerCycle, 2), " for the next ", CRLMinAgeHours, " hours.");
    }

    Print("🔍 Scanning positions for CRL compression. Available Wallet: $", DoubleToString(g_VirtualRecoveryWallet, 2), " | Spent in Cycle: $", DoubleToString(g_CycleSpentAmount, 2), " / $", DoubleToString(CRLMaxClosurePerCycle, 2));
    
    // Loop to continuously process any losing positions that fit the wallet AND within cycle limit
    while(g_VirtualRecoveryWallet > 0.01 && g_CycleSpentAmount < CRLMaxClosurePerCycle) {
        double maxAllowedLossToClose = MathMin(g_VirtualRecoveryWallet, CRLMaxClosurePerCycle - g_CycleSpentAmount);
        if (maxAllowedLossToClose < 0.01) break;
        
        ulong bestTicket = 0;
        double bestLoss = 0.0;
        double positionVol = 0.0;
        string bestSymbol = "";
        datetime oldestTime = 0;
        
        for(int i = PositionsTotal() - 1; i >= 0; i--) {
            ulong ticket = PositionGetTicket(i);
            if(ticket <= 0) continue;
            
            double rawProfit = PositionGetDouble(POSITION_PROFIT);
            double swap = PositionGetDouble(POSITION_SWAP);
            double profit = rawProfit + swap; // Using net profit
            
            if(profit >= 0) continue; // Skip profitable positions
            
            datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
            
            // Skip trades that are too new (not "stuck" yet)
            int ageSeconds = (int)(TimeCurrent() - openTime);
            if (ageSeconds < (CRLMinAgeHours * 3600)) {
                continue; // Do not use Wallet budget on fresh trades!
            }
            
            string symbol = PositionGetString(POSITION_SYMBOL);
            double volume = PositionGetDouble(POSITION_VOLUME);
            
            // Select the oldest loss
            if(bestTicket == 0 || openTime < oldestTime) {
                oldestTime = openTime;
                bestLoss = profit;
                bestTicket = ticket;
                bestSymbol = symbol;
                positionVol = volume;
            }
        }
        
        // If we found an eligible trade, check if we can close it fully or partially
        if(bestTicket > 0 && bestSymbol != "") {
            double absLoss = MathAbs(bestLoss);
            
            // Scenario A: Full Close
            if(absLoss <= maxAllowedLossToClose) {
                Print("⚔️ Wallet Full Close Triggered! Ticket: ", bestTicket, " | Loss: $", DoubleToString(bestLoss, 2), " | Wallet: $", DoubleToString(g_VirtualRecoveryWallet, 2));
                
                trade.SetDeviationInPoints(9999);
                trade.SetExpertMagicNumber(0);
                
                if(trade.PositionClose(bestTicket)) {
                    g_CycleSpentAmount += absLoss;
                    GlobalVariableSet("Arkon_CycleSpent_1337", g_CycleSpentAmount);
                    g_CapitalReleased += absLoss;
                    g_VirtualRecoveryWallet -= absLoss;
                    GlobalVariableSet("Arkon_VirtualWallet_1337", g_VirtualRecoveryWallet);
                    g_TotalCompressionCycles++;
                    Print("✅ Wallet Full Close SUCCESS! Trade removed. New Wallet Balance: $", DoubleToString(g_VirtualRecoveryWallet, 2));
                } else {
                    Print("❌ Wallet Full Close Failed! Ticket: ", bestTicket, " Retcode: ", trade.ResultRetcode(), " Desc: ", trade.ResultRetcodeDescription());
                    break;
                }
            } 
            // Scenario B: Partial Position Compression (PPC) - Dynamic and outside-the-box!
            else {
                // Calculate loss per unit volume (1 lot)
                double lossPerLot = absLoss / positionVol;
                if(lossPerLot <= 0.01) {
                    Print("⚠️ Error: Invalid loss-per-lot calculated: ", lossPerLot);
                    break;
                }
                
                // Volume that our remaining budget can close: volume = budget / lossPerLot
                double volumeToClose = maxAllowedLossToClose / lossPerLot;
                
                // Align with broker rules
                double minVol = SymbolInfoDouble(bestSymbol, SYMBOL_VOLUME_MIN);
                double stepVol = SymbolInfoDouble(bestSymbol, SYMBOL_VOLUME_STEP);
                if(minVol <= 0) minVol = 0.01;
                if(stepVol <= 0) stepVol = 0.01;
                
                // Round down to stepVol to stay safe and within budget
                volumeToClose = MathFloor(volumeToClose / stepVol) * stepVol;
                
                if(volumeToClose >= minVol && volumeToClose < positionVol) {
                    // Calculate exact loss to realize from this partial close
                    double realizedLoss = volumeToClose * lossPerLot;
                    
                    Print("⚔️ PPC (Partial Position Compression) Triggered! Ticket: ", bestTicket, 
                          " | Total Vol: ", DoubleToString(positionVol, 2), 
                          " | Closing Part: ", DoubleToString(volumeToClose, 2), 
                          " | Realizing Loss: $", DoubleToString(realizedLoss, 2), 
                          " | Budget Available: $", DoubleToString(maxAllowedLossToClose, 2));
                    
                    trade.SetDeviationInPoints(9999);
                    trade.SetExpertMagicNumber(0);
                    
                    if(trade.PositionClosePartial(bestTicket, volumeToClose)) {
                        g_CycleSpentAmount += realizedLoss;
                        GlobalVariableSet("Arkon_CycleSpent_1337", g_CycleSpentAmount);
                        g_CapitalReleased += realizedLoss;
                        g_VirtualRecoveryWallet -= realizedLoss;
                        GlobalVariableSet("Arkon_VirtualWallet_1337", g_VirtualRecoveryWallet);
                        g_TotalCompressionCycles++;
                        Print("✅ PPC Partial Close SUCCESS! New position volume remaining: ", DoubleToString(positionVol - volumeToClose, 2), 
                              " | New Wallet Balance: $", DoubleToString(g_VirtualRecoveryWallet, 2));
                    } else {
                        Print("❌ PPC Partial Close Failed! Ticket: ", bestTicket, " Retcode: ", trade.ResultRetcode(), " Desc: ", trade.ResultRetcodeDescription());
                        break;
                    }
                } else {
                    Print("ℹ️ PPC Skipped: Calculated volume to close (", DoubleToString(volumeToClose, 2), ") is less than minVol (", DoubleToString(minVol, 2), ") or equal to total position volume.");
                    break;
                }
            }
        } else {
            break;
        }
    }
    
    // Let's identify the deepest oldest loss that exceeds our wallet
    ulong type3Ticket = 0;
    double type3Loss = 0.0;
    string type3Symbol = "";
    datetime type3OldestTime = 0;
    
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        
        double rawProfit = PositionGetDouble(POSITION_PROFIT);
        double swap = PositionGetDouble(POSITION_SWAP);
        double profit = rawProfit + swap; 
        
        if(profit >= 0) continue;
        
        datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
        
        int ageSeconds = (int)(TimeCurrent() - openTime);
        if (ageSeconds < (CRLMinAgeHours * 3600)) {
            continue;
        }
        
        if(MathAbs(profit) > g_VirtualRecoveryWallet) {
            if(type3Ticket == 0 || openTime < type3OldestTime) {
                type3OldestTime = openTime;
                type3Loss = profit;
                type3Ticket = ticket;
                type3Symbol = PositionGetString(POSITION_SYMBOL);
            }
        }
    }
    
    if(type3Ticket > 0) {
        Print("ℹ️ CRL Queue (Exceeds Wallet): Ticket: ", type3Ticket, " | Loss: $", DoubleToString(-type3Loss, 2), " | Wallet: $", DoubleToString(g_VirtualRecoveryWallet, 2), " | Need: $", DoubleToString(-type3Loss - g_VirtualRecoveryWallet, 2), " more. Waiting for budget to grow.");
    }
}

// --- BASKET TRAILING STATE ---
struct BasketTrailingState {
    string key;
    double maxProfit;
};
BasketTrailingState g_basketTrailing[20];

void UpdateBasketMaxProfit(string key, double currentProfit) {
    for(int i = 0; i < 20; i++) {
        if(g_basketTrailing[i].key == key) {
            if(currentProfit > g_basketTrailing[i].maxProfit) {
                g_basketTrailing[i].maxProfit = currentProfit;
            }
            return;
        }
        if(g_basketTrailing[i].key == "") {
            g_basketTrailing[i].key = key;
            g_basketTrailing[i].maxProfit = currentProfit;
            return;
        }
    }
}
double GetBasketMaxProfit(string key) {
    for(int i = 0; i < 20; i++) {
        if(g_basketTrailing[i].key == key) return g_basketTrailing[i].maxProfit;
        if(g_basketTrailing[i].key == "") return 0.0;
    }
    return 0.0;
}
void ClearBasketState(string key) {
    for(int i = 0; i < 20; i++) {
        if(g_basketTrailing[i].key == key) {
            g_basketTrailing[i].key = "";
            g_basketTrailing[i].maxProfit = 0.0;
        }
    }
}

void ManageLocalTrades() {
    CleanTrailingStates();

    double floatingPnl = AccountInfoDouble(ACCOUNT_EQUITY) - AccountInfoDouble(ACCOUNT_BALANCE);
    if (HardPortfolioStopLossUSD > 0 && floatingPnl <= -HardPortfolioStopLossUSD) {
        Print("🚨 PANIC: Portfolio Drawdown exceeded -$ ", HardPortfolioStopLossUSD, ". Emergency closing all trades!");
        for(int i = PositionsTotal() - 1; i >= 0; i--) {
            ulong t = PositionGetTicket(i);
            if(t > 0) {
                trade.SetDeviationInPoints(9999);
                trade.PositionClose(t);
            }
        }
        return; 
    }

    if (TargetDollarProfit <= 0) return;
    
    // --- SMART BASKET TRAILING (نظام الإغلاق المجمع) ---
    // 1. Group positions by Symbol + Direction
    string symbols[20];
    double longsPnL[20];
    double shortsPnL[20];
    int longsCount[20];
    int shortsCount[20];
    int symCount = 0;
    
    for(int i = 0; i < 20; i++) { longsPnL[i] = 0; shortsPnL[i] = 0; longsCount[i] = 0; shortsCount[i] = 0; symbols[i] = ""; }

    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        string symbol = PositionGetString(POSITION_SYMBOL);
        double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
        if(HistorySelectByPosition(ticket)) {
            int deals = HistoryDealsTotal();
            for(int d = 0; d < deals; d++) {
                ulong deal_ticket = HistoryDealGetTicket(d);
                if(deal_ticket > 0) profit += HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
            }
        }
        
        int symIdx = -1;
        for(int s = 0; s < symCount; s++) {
            if (symbols[s] == symbol) { symIdx = s; break; }
        }
        if (symIdx == -1 && symCount < 20) {
            symIdx = symCount;
            symbols[symIdx] = symbol;
            symCount++;
        }
        
        if (symIdx != -1) {
            long type = PositionGetInteger(POSITION_TYPE);
            if(type == POSITION_TYPE_BUY) {
                longsPnL[symIdx] += profit;
                longsCount[symIdx]++;
            } else if (type == POSITION_TYPE_SELL) {
                shortsPnL[symIdx] += profit;
                shortsCount[symIdx]++;
            }
        }
    }

    // 2. Process Baskets
    for(int s = 0; s < symCount; s++) {
        string sym = symbols[s];
        
        // Process Longs Basket
        if (longsCount[s] > 1) {
            string bKey = sym + "_LONG";
            double pnl = longsPnL[s];
            // dynamic target based on number of trades
            double basketTarget = TargetDollarProfit * (longsCount[s] * 0.75); // slight discount for basket
            
            if (pnl >= basketTarget) {
                UpdateBasketMaxProfit(bKey, pnl);
                double maxP = GetBasketMaxProfit(bKey);
                double trailDrop = TrailingDropUSD * longsCount[s];
                
                if (maxP - pnl >= trailDrop || !EnableSmartTrailing) {
                    Print("🧺 BASKET TP HIT! Closing ALL LONGS for ", sym, " | Net Profit: $", DoubleToString(pnl, 2), " (Max: $", DoubleToString(maxP, 2), ")");
                    for(int i = PositionsTotal() - 1; i >= 0; i--) {
                        ulong t = PositionGetTicket(i);
                        if(t > 0 && PositionGetString(POSITION_SYMBOL) == sym && PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) {
                            trade.SetDeviationInPoints(9999);
                            trade.PositionClose(t);
                        }
                    }
                    ClearBasketState(bKey);
                }
            } else if (pnl < basketTarget * 0.5) {
                 ClearBasketState(bKey); // Reset if it drops below half target
            }
        }
        
        // Process Shorts Basket
        if (shortsCount[s] > 1) {
            string bKey = sym + "_SHORT";
            double pnl = shortsPnL[s];
            double basketTarget = TargetDollarProfit * (shortsCount[s] * 0.75);
            
            if (pnl >= basketTarget) {
                UpdateBasketMaxProfit(bKey, pnl);
                double maxP = GetBasketMaxProfit(bKey);
                double trailDrop = TrailingDropUSD * shortsCount[s];
                
                if (maxP - pnl >= trailDrop || !EnableSmartTrailing) {
                    Print("🧺 BASKET TP HIT! Closing ALL SHORTS for ", sym, " | Net Profit: $", DoubleToString(pnl, 2), " (Max: $", DoubleToString(maxP, 2), ")");
                    for(int i = PositionsTotal() - 1; i >= 0; i--) {
                        ulong t = PositionGetTicket(i);
                        if(t > 0 && PositionGetString(POSITION_SYMBOL) == sym && PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL) {
                            trade.SetDeviationInPoints(9999);
                            trade.PositionClose(t);
                        }
                    }
                    ClearBasketState(bKey);
                }
            } else if (pnl < basketTarget * 0.5) {
                 ClearBasketState(bKey);
            }
        }
    }
    
    // --- INDIVIDUAL TP ---
    for(int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if(ticket <= 0) continue;
        
        string symbol = PositionGetString(POSITION_SYMBOL);
        long type = PositionGetInteger(POSITION_TYPE);
        
        // Skip individual TP if this trade is part of a basket (count > 1)
        bool isPartOfBasket = false;
        for(int s = 0; s < symCount; s++) {
            if (symbols[s] == symbol) {
                if (type == POSITION_TYPE_BUY && longsCount[s] > 1) isPartOfBasket = true;
                if (type == POSITION_TYPE_SELL && shortsCount[s] > 1) isPartOfBasket = true;
                break;
            }
        }
        
        if (isPartOfBasket) continue;

        double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
        double commission = 0;
        
        if(HistorySelectByPosition(ticket)) {
            int deals = HistoryDealsTotal();
            for(int d = 0; d < deals; d++) {
                ulong deal_ticket = HistoryDealGetTicket(d);
                if(deal_ticket > 0) commission += HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
            }
        }
        
        double netProfit = profit + commission;
        
        // Native local close with Smart Trailing TP
        if (EnableSmartTrailing) {
            if (netProfit >= TargetDollarProfit) {
                UpdateMaxProfit(ticket, netProfit);
                double maxP = GetMaxProfit(ticket);
                
                if (maxP - netProfit >= TrailingDropUSD) {
                    Print("Smart Trailing TP Hit! Ticket: ", ticket, " Max Profit: $", DoubleToString(maxP, 2), " Closed at: $", DoubleToString(netProfit, 2));
                    trade.SetDeviationInPoints(9999);
                    trade.SetExpertMagicNumber(0);
                    trade.PositionClose(ticket);
                }
            }
        } else {
            // Hard TP
            if (netProfit >= TargetDollarProfit) {
                Print("Local EA TP Hit! Profit: $", DoubleToString(netProfit, 2), " >= $", DoubleToString(TargetDollarProfit, 2), ". Closing ticket ", ticket);
                trade.SetDeviationInPoints(9999);
                trade.SetExpertMagicNumber(0);
                trade.PositionClose(ticket);
            }
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
        positionsJson += "{\\\"ticket\\\":" + (string)ticket + ",\\\"symbol\\\":\\\"" + symbol + "\\\",\\\"direction\\\":\\\"" + direction + "\\\",\\\"volume\\\":" + DoubleToString(volume, 3) + ",\\\"openPrice\\\":" + DoubleToString(openPrice, 5) + ",\\\"currentPrice\\\":" + DoubleToString(currentPrice, 5) + ",\\\"profitPoints\\\":" + DoubleToString(profitPoints, 2) + ",\\\"pnl\\\":" + DoubleToString(netProfit, 5) + ",\\\"gross\\\":" + DoubleToString(profit, 5) + "}";
    }
    positionsJson += "]";
    
    char post[], result[]; string result_headers;
    string url = g_WebhookURL + "/api/mt5/sync";
    string headers = "Content-Type: application/json\\r\\nAuthorization: Bearer " + WebhookSecret + "\\r\\nUser-Agent: MetaTrader 5\\r\\n\\r\\n";
    double diff = g_CurrentClosedProfit - g_AccumulatedClosedProfit;
    double budgetEst = (diff > 0) ? (diff * (CRLProfitAllocationPct / 100.0)) : 0.0;
    double accountEquity = AccountInfoDouble(ACCOUNT_EQUITY);
    double accountMargin = AccountInfoDouble(ACCOUNT_MARGIN);
    string payload = "{\\\"positions\\\":" + positionsJson + ",\\\"crl_baseline\\\":" + DoubleToString(g_AccumulatedClosedProfit, 2) + ",\\\"crl_current\\\":" + DoubleToString(g_CurrentClosedProfit, 2) + ",\\\"crl_diff\\\":" + DoubleToString(diff, 2) + ",\\\"crl_budget\\\":" + DoubleToString(budgetEst, 2) + ",\\\"crl_threshold\\\":" + DoubleToString(CRLIncrementThreshold, 2) + ",\\\"equity\\\":" + DoubleToString(accountEquity, 2) + ",\\\"margin\\\":" + DoubleToString(accountMargin, 2) + "}";
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
            if(res == 1003 || res == 302) {
                Print("❌ Bridge Connection Error: AI Studio Preview URL blocked the request (Cookie/JS Check).");
                Print("💡 FIX: Run the app locally (127.0.0.1:3000) or Deploy it to a production server.");
            } else {
                Print("❌ Bridge Connection Error during SendState. HTTP Code: ", res);
            }
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
            }
        }
    }
    if(!closedAny) Print("Centralized Exit: Zero positions matched for forced closure. Ticket: ", ticket, " Symbol: ", symbolToClose);
}

void ProcessSignal(string json) {
    string action = "";
    string signalId = ExtractJSONString(json, "id");
    string payloadError = ExtractJSONString(json, "error");
    string payloadMessage = ExtractJSONString(json, "message");

    if(StringLen(payloadError) > 0 || StringLen(payloadMessage) > 0) {
        Print("[MT5 PAYLOAD INFO] id=", signalId, " error=", payloadError, " message=", payloadMessage);
    }

    if(StringLen(action) == 0) action = ExtractJSONString(json, "action_type");
    if(StringLen(action) == 0) action = ExtractJSONString(json, "action");
    
    if(action == "CLOSE") {
        long ticket = 0;
        if(ticket == 0) ticket = ExtractJSONLong(json, "ticket");
        string symbolToClose = "";
        if(StringLen(symbolToClose) == 0) symbolToClose = ExtractJSONString(json, "symbol");
        Print("Processing CLOSE ticket: ", ticket, " symbol: ", symbolToClose);
        ForceCloseAllMatching(ticket, symbolToClose);
        return;
    }

    string rawAsset = "";
    string rawSymbolExtracted = "";
    if(StringLen(rawAsset) == 0) rawAsset = ExtractJSONString(json, "asset");
    if(StringLen(rawSymbolExtracted) == 0) rawSymbolExtracted = ExtractJSONString(json, "symbol");
    
    string chosenSource = "";
    string rawSymbol = "";
    
    if(StringLen(rawSymbolExtracted) > 0) {
        rawSymbol = rawSymbolExtracted;
        chosenSource = "symbol";
    } else if(StringLen(rawAsset) > 0) {
        rawSymbol = rawAsset;
        chosenSource = "asset";
    } else {
        rawSymbol = ExtractJSONString(json, "original_symbol");
        chosenSource = "fallback";
    }
    
    Print("Centralized Entry Diagnostics:");
    Print("  payload.asset = ", rawAsset);
    Print("  payload.symbol = ", rawSymbolExtracted);
    Print("  chosen execution symbol source = ", chosenSource);
    Print("  chosen execution symbol value = ", rawSymbol);
    string direction = "";
    double lotSize = 0.0;
    double sl = 0.0;
    if(StringLen(direction) == 0) direction = ExtractJSONString(json, "direction");
    if(lotSize <= 0.0) lotSize = ExtractJSONDouble(json, "fixedLotSize");
    if(sl <= 0.0) sl = ExtractJSONDouble(json, "stopLoss");
    if(lotSize < 0.01) lotSize = 0.01; // FAILSAFE: minimum volume fallback

    // --- CHILD ORDER PARSING ---
    int sliceIndex = 0;
    int totalSlices = 1;
    if(totalSlices <= 0) totalSlices = (int)ExtractJSONLong(json, "totalSlices");
    if(totalSlices <= 0) totalSlices = 1;
    if(sliceIndex < 0) sliceIndex = (int)ExtractJSONLong(json, "sliceIndex");
    if(sliceIndex < 0) sliceIndex = 0;
    if(totalSlices <= 0) totalSlices = 1;
    string executionStyle = ExtractJSONString(json, "executionStyle");
    string routeHint = ExtractJSONString(json, "routeHint");

    if (totalSlices > 1) {
        Print("🔪 [CHILD ORDER DISPATCH] Executing Slice ", (sliceIndex + 1), "/", totalSlices, " | Style: ", executionStyle, " | Route: ", routeHint);
    }

    
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
    
    Print("  attempted broker symbol = ", resolvedSymbol);
    
    if(!SymbolSelect(resolvedSymbol, true)) {
        Print("Centralized Entry: Failed to resolve symbol matching ", rawSymbol);
        
        // Send error callback
        string errUrl = g_WebhookURL + "/api/mt5/error";
        string errMessage = "تعذر مطابقة الرمز الداخلي مع رمز وسيط قابل للتداول: " + rawSymbol;
        string errPayload = StringFormat(
           "{\"id\":\"%s\",\"error\":\"%s\",\"message\":\"%s\",\"asset\":\"%s\"}",
           signalId,
           "BROKER_SYMBOL_NOT_RESOLVED",
           errMessage,
           rawSymbol
        );

        char errPost[];
        char errResult[];
        string errHeaders = "Content-Type: application/json\\r\\nAuthorization: Bearer " + WebhookSecret + "\\r\\n";
        string errResHeaders = "";

        StringToCharArray(errPayload, errPost, 0, StringLen(errPayload), CP_UTF8);

        int errRes = WebRequest(
           "POST",
           errUrl,
           errHeaders,
           5000,
           errPost,
           errResult,
           errResHeaders
        );
        if(errRes != 200) {
            Print("Failed to report /api/mt5/error, HTTP=", errRes, " LastError=", GetLastError());
        }
        
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
                        Print(action + " FAILED (RETURN) with SL: ", trade.ResultRetcodeDescription(), " Retrying WITHOUT SL...");
                        if(!trade.Buy(lotSize, resolvedSymbol, 0, 0, 0, action)) {
                             Print("FINAL FAIL: ", trade.ResultRetcodeDescription());
                        } else Print(action + " SUCCESS(NO_SL): LONG ", resolvedSymbol);
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
                        Print(action + " FAILED (RETURN) with SL: ", trade.ResultRetcodeDescription(), " Retrying WITHOUT SL...");
                        if(!trade.Sell(lotSize, resolvedSymbol, 0, 0, 0, action)) {
                             Print("FINAL FAIL: ", trade.ResultRetcodeDescription());
                        } else Print(action + " SUCCESS(NO_SL): SHORT ", resolvedSymbol);
                    } else Print(action + " SUCCESS(RETURN): SHORT ", resolvedSymbol);
                } else Print(action + " SUCCESS(IOC): SHORT ", resolvedSymbol);
            } else Print(action + " SUCCESS(FOK): SHORT ", resolvedSymbol);
        }
    }
}

string ExtractJSONString(string json, string key) {
    string search1 = "\\\"" + key + "\\\":\\\"";
    string search2 = "\\\"" + key + "\\\": \\\"";
    int start = StringFind(json, search1);
    int offset = StringLen(search1);
    if(start < 0) { start = StringFind(json, search2); offset = StringLen(search2); }
    if(start < 0) return "";
    int quoteStart = start + offset;
    int quoteEnd = StringFind(json, "\\\"", quoteStart);
    if(quoteEnd < 0) return "";
    return StringSubstr(json, quoteStart, quoteEnd - quoteStart);
}

double ExtractJSONDouble(string json, string key) {
    string search1 = "\\\"" + key + "\\\":";
    string search2 = "\\\"" + key + "\\\": ";
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
    string search1 = "\\\"" + key + "\\\":";
    string search2 = "\\\"" + key + "\\\": ";
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
`;


