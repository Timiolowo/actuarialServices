#---------------------------------------
# TITILE: REVISED COMPOSITE DATA SORTING
# BY: TIMILEHIN OLOWOLAFE
# DATE: 2024-07-06 | 12:50:19 WAT
#---------------------------------------


rm(list = ls())

{
  # LOAD THE REQUIRED LIBRARIES------
  library(tidyverse)
  library(lubridate)
  library(readxl)
  library(openxlsx2)
  library(openxlsx)
  library(RODBC)
  library(dplyr)
}

#GET THE LAST DATE OF PREVIOUS MONTH
{

  date <- today() - day(today())
}


#FROM FINCON REPORT TO REVISED COMPOSITE SHEET--------
{
  fincon <- paste0("C:/Users/Olowolafe/Documents/P&C/Data/FINCON DATA/",format(date, "%Y"),"/Fincon Report, ",format(date, "%B %Y"),".xlsx")
  sheets <- excel_sheets(fincon)
  print(sheets)
  getwb <- paste0("C:/Users/Olowolafe/Documents/P&C/Templates/Revised Composite Template.xlsx")
  wb <- loadWorkbook(getwb)
  getpath1 <- paste0("C:/Users/Olowolafe/Documents/P&C/Data/PRODUCTION/",format(date, "%Y"),"/",toupper(format(date, "%B")),
                     "/DATA SORTING ", toupper(format(date, "%B %Y")),".xlsx")
  getwb <- paste0("C:/Users/Olowolafe/Documents/P&C/Templates/DataSorting.xlsx")
}


{
  #dplyr::select OUTSTANDING CLAIMS ALL NAIRA DATA
  print(sheets)
  osNaira <- read_excel(fincon, sheet = "Outstanding Claims All")
  
  osNaira1 <- osNaira %>% dplyr::select(BRANCH, OFFICE, CLASS, `AXA PRODUCT`, Attritional, CLM_KEY, CUST_NAME, PRODUCT_NAME, POLICY_KEY, `CUST TYPE`)
  osNaira2 <- osNaira %>% dplyr::select(EVENT_DESC, LOSS_DT) %>% mutate(LOSS_YEAR = year(LOSS_DT))
  osNaira3 <- osNaira %>% dplyr::select(NOTIFICN_DT, REG_DT, CUST_NO, `CUST COUNTRY`, AGENT_NO, AGENT_NAME, Currency, RESERVE_AMOUNT, PAID_AMOUNT, OS_AMOUNT, PREMIUM, SUM_INSURED, START_DT, END_DT,
                                 HOLDING_DAYS, CLAIM_STATUS, `LOSS TYPE`, `RJECTION REASON`, `SENSITIVE LAIMS`, `ADJUSTER NAME`, `DRIVER NAME`, `COMMENT OS`, `EXCESS DESC`, EXCESS1, EXCESS2, EXCESS3)
  
  
  #WRITE THE DATA TO EXCEL
  writeData(wb, osNaira1, sheet = "Outstanding Claims - Naira", startRow = 2, colNames = F)
  writeData(wb, osNaira2, sheet = "Outstanding Claims - Naira", startRow = 2, startCol = 12, colNames = F)
  writeData(wb, osNaira3, sheet = "Outstanding Claims - Naira", startRow = 2, startCol = 15, colNames = F)
}


{
  #OUTSTANDING CLAIMS PER SBU
  print(sheets)
  osSbu <- read_excel(fincon, sheet =  "Outstanding Claims All by SBUs")
  writeData(wb, osSbu, sheet = "Outstanding Claims All (SBU)", startRow = 2, colNames = F)
}

{
  #OUTSTANDING CLAIMS - FOREIGN
  print(sheets)
  osfx <- read_excel(fincon, sheet = "Outstanding Claims FX")
  osfx <- mutate(osfx, UNIQUE_KEY = paste0(CLM_KEY,"-",CUST_NAME,"-",POLICY_KEY))
  osfx <- osfx %>% dplyr::select(UNIQUE_KEY, BRANCH, OFFICE, CLASS, PRODUCT_NAME, `AXA PRODUCT`, Attritional, CLM_KEY, 
                          POLICY_KEY, CUST_NO, CUST_NAME, `CUST TYPE`, `CUST COUNTRY`, AGENT_NO, AGENT_NAME, Currency, 
                          RESERVE_AMOUNT, PAID_AMOUNT, OS_AMOUNT, PREMIUM, SUM_INSURED, START_DT, END_DT, LOSS_DT, 
                          NOTIFICN_DT, REG_DT, HOLDING_DAYS, EVENT_DESC, CLAIM_STATUS, `LOSS TYPE`, `RJECTION REASON`, 
                          `SENSITIVE LAIMS`,`ADJUSTER NAME`, `DRIVER NAME`, `COMMENT OS`, `EXCESS DESC`, EXCESS1, 
                          EXCESS2, EXCESS3)
  writeData(wb, osfx, sheet = "Outstanding Claims - Foreign", startRow = 2, colNames = F)
  
}


{
  #OUTSTANDING CLAIMS PER SBU - FX
  print(sheets)
  osSbufx <- read_excel(fincon, sheet = "Outstanding Claims FX by SBUs")
  writeData(wb, osSbufx, sheet = "Outstanding Claims Foreign(SBU)", startRow = 2, colNames = F)
}


{
  #CLAIMS PAID MONTH ONLY
  print(sheets)
  name <- "Claims Paid June 2026 only"
  cpMonth <- read_excel(fincon, sheet = name)
  cpMonth <- cpMonth %>%  dplyr::select(
    `Claim No`, `Insured name`, `AXA PRODUCT`, `Pol No`, `Cust Category`, `Loss Details`, `Loss Nature`, `Accident Date`, 
    `Notif Date`, `Reg Date`, `Pay/Rec Slip Date`, SBU, `Paid Amount`,Branch, Office, Class, `Sub Class`,
    Attritional, Policy_id, `Policy Start Date`, `Policy End Date`, `Cust Type`, `Cust Country`, `AGENT name`, 
    `SBU PCNT`, `Plate No`, `Chasis No`, `Claim Year`, HOLDING_DAYS, `Loss Adjuster`, `Place of Loss - Area`, 
    `Place of Loss - LGA`, `Pay/Rec Slip No`, Cuurency, `Last Reserve`, `Payment_Type`, `Paid To`, Remarks, 
    `USER NAME`, `Claims Status`, `Policy Remarks`, `Car Type`, `Car Model`, `Car Year`, Age, Gender, 
    State, Occupation, `RJECTION REASON`, `DAMAGE ITEMS`, `SENSITIVE LAIMS`, 
    `DRIVER NAME`, `EXCESS DESC`, EXCESS1, EXCESS2,
  )
  
  
  writeData(wb, cpMonth, sheet = "Claims Paid - Month Only", startRow = 2, colNames = F)
}


{
  #CLAIMS PAID YTD
  cpytd <- read_excel(fincon, sheet = "Claims paid YTD")
  cpytd <- cpytd %>%  dplyr::select(`Branch`, `Office`, `Class`, `Sub Class`, `AXA PRODUCT`, `NACE CODE`, `NACE DESC`, `Attritional`, 
                                 `Pol No`, `Policy_id`, `Policy Start Date`, `Policy End Date`, `Insured name`, `Cust Type`, 
                                 `Cust Country`, `Cust Category`, `AGENT name`, `SBU`, `SBU PCNT`, `Plate No`, `Chasis No`, 
                                 `Claim No`, `Claim Year`, `Accident Date`, `Reg Date`, `Notif Date`, `HOLDING_DAYS`, `Loss Adjuster`, 
                                 `Loss Details`, `Loss Nature`, `Place of Loss - Area`, `Place of Loss - LGA`, `Pay/Rec Slip No`, 
                                 `Pay/Rec Slip Date`, `Cuurency`, `Last Reserve`, `Paid Amount`, `Payment_Type`, `Paid To`, `Remarks`, 
                                 `USER NAME`, `Claims Status`, `Policy Remarks`, `Car Type`, `Car Model`, `Car Year`, `Age`, `Gender`, 
                                 `State`, `Occupation`, `RJECTION REASON`, `DAMAGE ITEMS`, `SENSITIVE LAIMS`, `DRIVER NAME`, 
                                 `EXCESS DESC`, `EXCESS1`, `EXCESS2`)

  
  writeData(wb, cpytd, sheet = "Claims Paid - YTD", startRow = 2, colNames = F)
}



#CLAIMS PAID LOB SPLIT
{
 cpmodel <- cpytd %>% dplyr::select(`Claim No`,`Insured name`, `Sub Class`, `Pol No`,`Cust Category`,
                             `Loss Details`,`Loss Nature`,`Accident Date`, `Notif Date`,`Reg Date`, `Pay/Rec Slip Date`,
                             SBU, `Paid Amount`,`Class`)
  
  writeData(wb, cpmodel, sheet = "Paid Model Data", startRow = 2, colNames = F)
}


{
  #Model Numbers sorting
  val_date = date
   source("C:/Users/Olowolafe/Documents/P&C/Reserve Adjustment Sheet/Script/OSC_Currency_Conversion.R")
  writeData(wb, Model_outstanding, sheet = "OS Model Data", startRow = 2, colNames = F) 
  writeData(wb, Model_osc2, sheet = "HY_OSModel", startRow = 2, colNames = F) 
}

exchange_rate <- Exchange_Rate %>% filter(FX_DATE == date) %>% dplyr::select(-FX_DATE) %>% pivot_longer(cols = everything(), names_to = "Currency", values_to = "Value") %>% dplyr::select(Value)
writeData(wb, "Outstanding Claims - Naira", exchange_rate, startRow = 1, startCol = 50, colNames = F, keepNA = T)


#Claims Paid Reserving for our model
{
  cpr <- cpMonth %>% dplyr::select("Class", "Claim No", "Insured name", "AXA PRODUCT", "Pol No", "Cust Category", "Loss Details", "Loss Nature", "Accident Date","Notif Date", "Reg Date", "Pay/Rec Slip Date", "SBU", "Paid Amount") %>% 
    rename(PRODUCT_NAME = "AXA PRODUCT", `Cust Type` = "Cust Category", `LOSS_NATURE` = "Loss Nature", )
}

{
  #SAVE
  `getpath` <- paste0("C:/Users/Olowolafe/Documents/P&C/Revised Composite/",year(date),"/Revised Composite data sorting ",format(date, "%B %Y"),".xlsx")
  saveWorkbook(wb, getpath, overwrite = T)
}

