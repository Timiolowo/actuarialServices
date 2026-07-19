#-----------------------------------------------------------
#WRITTEN BY: TIMILEHIN OLOWOLAFE
#PURPOSE: OUTSTANDING CLAIMS CONVERSION TO NIARA
#DATE: 2025-03-05
#UPDATED: 2026-04-04
#-----------------------------------------------------

#GET THE DATA FROM ACCESS DATABASE

#GET PRODUCTION DATA FROM ACCESS DATABASE-----
{
  source("C:/Users/Olowolafe/OneDrive - axamansard.com/P & C Team/Database/Script/DatabaseConnect.R")
  DatabaseConnect(selection = "3")
  
  date = val_date
}
library(reshape2)

#CLEAN THE OUTSTANDING CLAIMS NAIRA AND DOLLAR DATA
{
  outstanding <- osc_data %>% dplyr::select(CLASS, CLM_KEY, POLICY_KEY, CUST_NAME, AMT_OUTSTANDING, LOSS_DT, NOTIFICN_DT,REG_DT)
  outstanding <-  outstanding %>% mutate(Unique = paste0(CLM_KEY,"-",CUST_NAME, "-", POLICY_KEY))
  osFx <- os_foreign %>%  dplyr::select(CLASS, CLM_KEY, POLICY_KEY, CUST_NAME, AMT_OUTSTANDING, LOSS_DT, Currency, NOTIFICN_DT,REG_DT) %>% 
    mutate(Unique = paste0(CLM_KEY,"-",CUST_NAME, "-", POLICY_KEY))
  
}

#GROUP THE DATA APPROPRAITELY TO MAKE IT UNIQUE AND DISTINCT
{
  oustanding <- outstanding %>% group_by(CLASS, CLM_KEY, POLICY_KEY, CUST_NAME, LOSS_DT, NOTIFICN_DT,REG_DT, Unique) %>% 
    summarise(ngn_Amount = AMT_OUTSTANDING)
  
  osFx <- osFx %>% group_by(CLASS, CLM_KEY, POLICY_KEY, CUST_NAME, LOSS_DT, NOTIFICN_DT,REG_DT,Currency, Unique) %>% 
    summarise(fx_Amount = AMT_OUTSTANDING) 
  
  osFx <- data.frame(osFx) %>% dplyr::select(Currency, Unique, fx_Amount)
  
  osJoin <- left_join(outstanding, osFx, by = "Unique") %>% mutate(Currency = replace_na(Currency,"Naira"), fx_Amount = replace_na(fx_Amount, 1)) %>% 
    dplyr::select(-Unique)
}

#GET THE EXCHANGE RATE TO BE USED FOR THE CONVERSION
{
  rate <- Exchange_Rate %>% filter(FX_DATE == date) 
  USD <- rate %>% pull(USD)
  pounds <- rate %>% pull(`POUND STERLING`)
  euro <- rate %>% pull(EURO)
}


#THE TWO POLICIES THAT REQUIRES SPLITS BTW NAIRA AND DOLLAR, SPLIT THEM
{
  p1 <- filter(osJoin, CLM_KEY == "OIG7-20/L/C") %>% mutate(AMT_OUTSTANDING = 6000000, fx_Amount = 0, Currency = "Naira")
  p1a <- filter(osJoin, CLM_KEY == "OIG7-20/L/C") %>% mutate(AMT_OUTSTANDING = AMT_OUTSTANDING - 6000000)
  JoinPs = rbind(p1,p1a)
  
  p2 <- filter(osJoin, CLM_KEY == "CAR8-21/L/C") %>% mutate(AMT_OUTSTANDING = 6000000, fx_Amount = 0, Currency = "Naira")
  p2a <- filter(osJoin, CLM_KEY == "CAR8-21/L/C") %>% mutate(AMT_OUTSTANDING = AMT_OUTSTANDING - 6000000)
  JoinPs2 = rbind(p2,p2a)
  
  cJoin <- rbind(JoinPs,JoinPs2)
}


#ENSURE THE SPLIT IS REMOVED FROM THE MAIN DATA
{
  osJoin <- filter(osJoin,  CLM_KEY != "CAR8-21/L/C" & CLM_KEY != "OIG7-20/L/C")
  Converted_outstanding <- rbind(osJoin, cJoin) %>% 
    rename(Amount = AMT_OUTSTANDING) %>%    
    mutate(
      rate = ifelse(Currency == "U.S Dollars", USD,ifelse(Currency == "Pound Sterling", pounds,ifelse(Currency == "Euro", euro, NA))),
      AMT_OUTSTANDING = ifelse(Currency == "Naira", Amount, ifelse(rate != "NA" & fx_Amount == 0, Amount, fx_Amount * rate)))
}


#-------------------------------------------------------------------
#DO THE SAME FOR OUR MODEL
#CLEAN THE OUTSTANDING CLAIMS NAIRA AND DOLLAR DATA
{
  outstanding <- osc_data %>% dplyr::select(CLM_KEY, CUST_NAME, PRODUCT_NAME, POLICY_KEY, `CUST TYPE`, AMT_OUTSTANDING, 
                                     EVENT_DESC, LOSS_DT, `NOTIFICN_DT`, REG_DT, SBU, CLAIM_STATUS, CLASS)
  outstanding <-  outstanding %>% mutate(Unique = paste0(CLM_KEY,"-",CUST_NAME, "-", POLICY_KEY))
}

#GROUP THE DATA APPROPRAITELY TO MAKE IT UNIQUE AND DISTINCT
{
  oustanding <- outstanding %>% group_by(CLM_KEY, CUST_NAME, PRODUCT_NAME, POLICY_KEY, `CUST TYPE`, AMT_OUTSTANDING, 
                                         EVENT_DESC, LOSS_DT, NOTIFICN_DT, REG_DT, SBU, CLAIM_STATUS, CLASS, Unique) %>% 
    summarise(ngn_Amount = AMT_OUTSTANDING)
  
  osJoin <- left_join(outstanding, osFx, by = "Unique") %>% mutate(Currency = replace_na(Currency,"Naira"), fx_Amount = replace_na(fx_Amount, 1)) %>% 
    dplyr::select(-Unique)
}


#THE TWO POLICIES THAT REQUIRES SPLITS BTW NAIRA AND DOLLAR, SPLIT THEM
{
  p1 <- filter(osJoin, CLM_KEY == "OIG7-20/L/C") %>% mutate(AMT_OUTSTANDING = 6000000, fx_Amount = 0, Currency = "Naira")
  p1a <- filter(osJoin, CLM_KEY == "OIG7-20/L/C") %>% mutate(AMT_OUTSTANDING = AMT_OUTSTANDING - 6000000)
  JoinPs = rbind(p1,p1a)
  
  p2 <- filter(osJoin, CLM_KEY == "CAR8-21/L/C") %>% mutate(AMT_OUTSTANDING = 6000000, fx_Amount = 0, Currency = "Naira")
  p2a <- filter(osJoin, CLM_KEY == "CAR8-21/L/C") %>% mutate(AMT_OUTSTANDING = AMT_OUTSTANDING - 6000000)
  JoinPs2 = rbind(p2,p2a)
  
  cJoin <- rbind(JoinPs,JoinPs2)
}


#ENSURE THE SPLIT IS REMOVED FROM THE MAIN DATA
{
  osJoin <- filter(osJoin,  CLM_KEY != "CAR8-21/L/C" & CLM_KEY != "OIG7-20/L/C")
  Model_outstanding <- rbind(osJoin, cJoin) %>% 
    rename(Amount = AMT_OUTSTANDING) %>%    
    mutate(
      rate = ifelse(Currency == "U.S Dollars", USD,ifelse(Currency == "Pound Sterling", pounds,ifelse(Currency == "Euro", euro, NA))),
      AMT_OUTSTANDING = ifelse(Currency == "Naira", Amount, ifelse(rate != "NA" & fx_Amount == 0, Amount, fx_Amount * rate)))
}

Model_outstanding <- Model_outstanding %>% dplyr::select(CLM_KEY, CUST_NAME, PRODUCT_NAME, POLICY_KEY, `CUST TYPE`, AMT_OUTSTANDING, 
                                                  EVENT_DESC, LOSS_DT, NOTIFICN_DT, REG_DT, SBU, CLAIM_STATUS, CLASS)


mm <- osc_data %>% dplyr::select(RESERVE, AMOUNT_PAID, CUST_NAME, POLICY_KEY, CLM_KEY) %>% 
  mutate(Unique = paste0(CLM_KEY,"-",CUST_NAME, "-", POLICY_KEY)) %>% dplyr::select(RESERVE, AMOUNT_PAID, Unique) %>% 
  group_by(Unique) %>% summarise(RESERVE = sum(RESERVE, na.rm = T), AMOUNT_PAID = sum(AMOUNT_PAID, na.rm = T))

mm1 <- Model_outstanding %>% mutate(Unique = paste0(CLM_KEY,"-",CUST_NAME, "-", POLICY_KEY))

mmm <- left_join(mm, mm1, by = "Unique")

Model_osc2 <- mmm %>% dplyr::select(CLM_KEY, CUST_NAME, EVENT_DESC, CLASS, POLICY_KEY, RESERVE, AMOUNT_PAID, 
                                           AMT_OUTSTANDING, LOSS_DT, NOTIFICN_DT, REG_DT) %>% 
  mutate(Branch = "", ACCOUNTING_DATE = date)

osc_data <- Model_osc2

#aaa <- Model_outstanding %>% group_by(CLASS) %>% summarise("OSC" = sum(AMT_OUTSTANDING, na.rm = T))

topFiveOs <- Model_outstanding %>% dplyr::select(CLASS, AMT_OUTSTANDING, LOSS_DT, NOTIFICN_DT, CUST_NAME) %>% arrange(desc(AMT_OUTSTANDING))
topFiveOS <- head(topFiveOs, 11)
#write.csv(topFiveOS,"topFiveOS.csv")
rm(p1,p1a,p2a,rate,osJoin,osFx,os_foreign,mm,mm1,mmm,JoinPs,JoinPs2,cJoin,p2)

result_ <- Converted_outstanding %>% group_by(CLASS) %>% 
  summarise("Expected Amount" = sum(AMT_OUTSTANDING, na.rm = T),
            "OS Amount" = sum(Amount, na.rm = T),
            "FX Adjustment" = `Expected Amount` - `OS Amount`)
result_

#LARGE LOSS AND ATTRITIONAL SPLIT
{
  
  llm_table <- llm_data %>% dplyr::select(-ID) %>% group_by(CLASS) %>% complete(YEAR = 2000:max(YEAR)) %>%
    fill(LIMIT, .direction = "up") %>% ungroup() %>% mutate(LLMKEY = tolower(paste0(CLASS,YEAR))) %>%  select(-CLASS, YEAR)
  
  ll_attr_split <- Converted_outstanding %>%  mutate(LLMKEY = tolower(paste0(CLASS,year(LOSS_DT)))) %>% left_join(llm_table, by = "LLMKEY") %>% 
    mutate("LOSSLIMIT" = ifelse(AMT_OUTSTANDING >= LIMIT, "LL", "ATTR"), PERIOD = ifelse(year(LOSS_DT) == year(date), "CY", "PY")) %>% 
    select(-fx_Amount,-rate,-YEAR,-LIMIT, -LLMKEY)
  
  
  LlAttrTable <- dcast(ll_attr_split, CLASS~PERIOD, fun.aggregate = sum, value.var = "AMT_OUTSTANDING", na.rm = T)
  #write.csv(LlAttrTable, "llmm.csv")
 # shell.exec("llmm.csv")
}
