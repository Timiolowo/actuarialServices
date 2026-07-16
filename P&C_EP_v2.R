#---------------------------------------
# TITILE: P&C EP AND OTHER CALCULATIONS
# BY: TIMILEHIN OLOWOLAFE
# DATE: 2024-06-22 | 12:50:19 WAT
# UPDATED:
#---------------------------------------

#CLEAR YOUR GLOBAL ENVIRONMENT
#rm(list = ls())

{
  # LOAD THE REQUIRED LIBRARIES----
  source("C:/Users/Olowolafe/OneDrive - axamansard.com/P & C Team/Database/Script/FolderAutomation.R")
  source("C:/Users/Olowolafe/Documents/P&C/Earned Premium/Scripts/EP_functions_v2.r")
  source("C:/Users/Olowolafe/OneDrive - axamansard.com/P & C Team/Database/Script/DatabaseConnect.R")
}


{
  #GET PRODUCTION DATA FROM ACCESS DATABASE----
  DatabaseConnect(selection = 1)

  #VALUATION DATE----
  options(digits = 15)
  valend <- today() - day(today()) #GET THE LAST DATE OF PREVIOUS MONTH as.Date(paste0("2025","-12","-31"))
  valstart <- as.Date(paste0(year(today()),"-01","-01")) #as.Date(paste0(2025,"-01","-01"))
}


{
  #EARNED PREMIUM AND OTHER CALCULATIONS----
  production <- as_tibble(prod_data) %>% filter(year(REGISTRATN_DT) <= year(valend) )
  production <- production %>% mutate(START_DATE = ymd(START_DATE), END_DATE = ymd(END_DATE),
                                      REGISTRATN_DT = ymd(REGISTRATN_DT),
                                      REPORT_MONTH = reportM(REGISTRATN_DT),
                                      UEndDate = EndDate(CLASS,START_DATE,END_DATE),
                                      DATE_TO_USE = dateToUse(START_DATE, UEndDate, valstart),
                                      DURATION = useDuration(START_DATE,UEndDate, REGISTRATN_DT, valstart, DATE_TO_USE),
                                      GWP_YTD = gwpytd(REGISTRATN_DT,valend,PREMIUM),
                                      EXPOSED_DAYS = exposedDays(DATE_TO_USE,valend,UEndDate, GWP_YTD),
                                      EARNED_FRAC = earnedfraction(EXPOSED_DAYS,DURATION, DATE_TO_USE, GWP_YTD),
                                      EARNED_PREMIUM = earnedPrem(PREMIUM,EARNED_FRAC),
                                      UNE_PERIOD = unePeriod(valend,UEndDate,DATE_TO_USE,DURATION),
                                      UNEARNED_PREM = unepremium(UNE_PERIOD,DURATION,PREMIUM),
                                      DAC = dac(UNE_PERIOD,DURATION,COMM))
}

#upr_2024 <- production
{
 Usedata <- production %>%
    select(POLICYKEY, CUSTOMER_NAME, START_DATE, END_DATE, PREMIUM, COMM, CLASS,REGISTRATN_DT, DURATION, 
           EXPOSED_DAYS, EARNED_FRAC, EARNED_PREMIUM,UNE_PERIOD, UNEARNED_PREM, DAC, GWP_YTD) %>%
    mutate(
      EARNED_FRAC = ifelse(is.na(EARNED_FRAC) | is.nan(EARNED_FRAC) | is.infinite(EARNED_FRAC), 0, EARNED_FRAC),
      EARNED_PREMIUM = ifelse(is.na(EARNED_PREMIUM) | is.nan(EARNED_PREMIUM) | is.infinite(EARNED_PREMIUM), 0, EARNED_PREMIUM)
    ) #%>% #filter(CLASS == "Energy") 
  
  workb <- ("C:/Users/Olowolafe/Documents/P&C/Templates/Earned Premium Data.xlsx")
  wbk <- loadWorkbook(workb)
  writeData(wbk, sheet = "Calculation", valstart, startCol = 5, startRow = 1)
  writeData(wbk, sheet = "Calculation", valend, startCol = 8, startRow = 1)
  writeData(wbk, sheet = "Calculation", Usedata, startCol = 1, startRow = 3, colNames = F)
  path3 <- paste0("C:/Users/Olowolafe/Documents/P&C/Earned Premium/EP Cal/",year(valend),"/Earned Premium Cal ",format(valend, "%B-%Y"),".xlsx")
  
  saveWorkbook(wbk, path3, overwrite = T)
}

{
  #SUMMARY----
  class <- production %>% group_by(CLASS) %>% summarise('EARNED PREMIUM' = sum(EARNED_PREMIUM, na.rm = T),
                                                        'UNEARNED PREMIUM' = sum(UNEARNED_PREM, na.rm = T),
                                                        'DAC' = sum(DAC, na.rm = T),
                                                        'GWP YTD' = sum(GWP_YTD, na.rm = T),
                                                        'Exposure' = sum(EXPOSED_DAYS, na.rm = T))
}

{
  #TOTAL FOR ALL----
  class <- class %>% filter(CLASS != is.na(CLASS))
  class <- sum_total(class)
  class$CLASS <-toupper(class$CLASS)
  print(class)
  class <- class %>% dplyr::select(-Exposure)
}

#efy <- exposurefy25 %>% select(CLASS, FY25EXP = Exposure) 
#ehy <- class %>% select(CLASS, HY25EXP = Exposure)
#fj <- left_join(efy,ehy, by = "CLASS")
#write.csv(fj, "exposure.csv")
#shell.exec("exposure.csv")

{
  #STORE AND WRITE THE DATA----
  workbook <- ("C:/Users/Olowolafe/Documents/P&C/Templates/Earned Premium Template.xlsx")
  wb <- loadWorkbook(workbook)
  writeData(wb, sheet = "RESULT", valstart, startCol = 4, startRow = 2)
  writeData(wb, sheet = "RESULT", valend, startCol = 7, startRow = 2)
  writeData(wb, sheet = "RESULT", class, startCol = 3, startRow = 4)
  
  #SAVE RESULT TP EXCEL----
  path <- paste0("C:/Users/Olowolafe/Documents/P&C/Earned Premium/Results/",year(valend),"/Earned Premium ",format(valend, "%b-%y"),".xlsx")
  path2 <- paste0(base_dir,"/",year(valend),"/",month_folder_name,"/Production/Earned Premium USD",format(valend, "%b-%y"),".xlsx")
  saveWorkbook(wb, path, overwrite = T)
  saveWorkbook(wb, path2, overwrite = T)
}

