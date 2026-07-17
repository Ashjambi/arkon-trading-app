const fs = require('fs');
let code = fs.readFileSync('src/utils/mqlCode.ts', 'utf8');

const startIdx = code.indexOf('void ManageLocalTrades() {');
const endIdx = code.indexOf('void SendState() {');

if (startIdx !== -1 && endIdx !== -1) {
    const before = code.slice(0, startIdx);
    const after = code.slice(endIdx);
    
    const newFunc = `// --- BASKET TRAILING STATE ---
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

`;

    fs.writeFileSync('src/utils/mqlCode.ts', before + newFunc + after);
    console.log("Successfully replaced ManageLocalTrades");
} else {
    console.log("Could not find start or end index");
}
