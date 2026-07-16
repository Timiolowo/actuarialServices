#---------------------------------------
# TITILE: P&C EP AND OTHER CALCULATIONS
# BY: TIMILEHIN OLOWOLAFE
# DATE: 2024-06-22
#---------------------------------------

# LOAD THE REQUIRED LIBRARIES
{
  library(tidyverse)
  library(lubridate)
  library(readxl)
  library(openxlsx)
  library(RODBC)
  library(dplyr)
}

#REPORT MONTH
reportM <- function(regDate) {
  
  regDate <- as.Date(regDate)
  ouput <- paste(format(regDate, "%b-%y"))
  return(ouput)
  
}

#END DATE
EndDate <- function(class,startdate,enddate) {
  startdate <- as.Date(startdate)
  enddate <- as.Date(enddate)
  output <- ifelse(class == "Marine Cargo", 
                   ifelse(is.na(enddate), startdate %m+% months(6)-1, enddate),enddate)
    return(as.Date(output))
}

#DURATION
#useDuration <- function(startdate, enddate) {
# 
#  enddate <- as.Date(enddate)
#  startdate <- as.Date(startdate)
#  return(as.numeric(+enddate - startdate)+1)
#  
#}

#DURATION
useDuration <- function(startdate, enddate, RegDate, valStart, dateToUse) {
 
  enddate <- as.Date(enddate)
  startdate <- as.Date(startdate)
  RegDate <- as.Date(RegDate)
  dateToUse <- as.Date(dateToUse)
  valStart <- as.Date(valStart)
  
  rtn <- ifelse(
    year(RegDate) == year(valStart) & year(RegDate) > year(startdate),
    dateToUse, startdate)
  
  return(as.numeric(+enddate - rtn)+1)
  
}

#DATE TO USE
dateToUse <- function(startdate, enddate, valstart) {
  
  valstart <- as.Date(valstart)
  enddate <- as.Date(enddate)
  startdate <- as.Date(startdate)
  return(as.Date(ifelse(valstart > enddate, as.Date(NA), pmax(valstart, startdate))))
  
}


#EXPOSED DAYS FUNCTION
exposedDays <- function(dateToUse, valEnd, enddate, gwpytd) {
  
  val_dateEnd <- as.Date(valEnd)
  enddate <- as.Date(enddate)
  dateToUse <- as.Date(dateToUse)
  
  days_diff <- ifelse(is.na(dateToUse) & gwpytd != 0, 1, difftime(pmin(val_dateEnd, enddate), dateToUse, units = "days") ) + 1
  rtn <- ifelse(is.na(dateToUse), 0, days_diff)
  rtnn <- ifelse(rtn < 0, 0, rtn)
  return(rtnn)
}

#EXPOSED DAYS FUNCTION
#exposedDays <- function(dateToUse, valEnd, enddate) {
#  
#  val_dateEnd <- as.Date(valEnd)
#  enddate <- as.Date(enddate)
#  dateToUse <- as.Date(dateToUse)
#  days_diff <- ifelse(is.na(dateToUse), 0, difftime(pmin(val_dateEnd, enddate), dateToUse, units = "days"))
# return(ifelse(is.na(dateToUse) | days_diff < 0, 0, days_diff + 1))
#  
#}


#EARNED FRACTION 
earnedfraction <- function(exposeddays, duration, dateToUse, gwpytd) {
  
  duration <- as.numeric(duration)
  exposeddays <- as.numeric(exposeddays)
  #output <- ifelse( is.infinite(exposeddays/duration), 0, exposeddays/duration)
  outputa <- ifelse(is.na(dateToUse) & gwpytd != 0, 1,  exposeddays/duration)
  output <- ifelse(is.infinite(outputa), 0, outputa)
  return(output)
  
}

#EARNED PREMIUM 
#earnedPrem <- function(premium, earnedfraction, RegDate, dateToUse) {
#  
#  RegDate <- as.Date(RegDate)
#  output <- 
#    ifelse(
#      is.na(dateToUse) & year(RegDate) != year(valstart),
#      0, premium * earnedfraction
#    )
#  
#  return(output)
#}


#EARNED PREMIUM 
earnedPrem <- function(premium, earnedfraction) {
  
  #RegDate <- as.Date(RegDate)
  output <- premium * earnedfraction
  
  return(output)
}

#UNEARNED PERIOD 
unePeriod <- function(valend, enddate,datetouse, duration) {
  output <-   ifelse(enddate > valend, 
                     ifelse(datetouse > valend, duration, enddate - valend),
                     0)
  return(output)
}

#UNEANRED PREMIUM
unepremium <- function(unperiod, duration, premium) {
  output <- ifelse(is.na((unperiod/duration)*premium), 0, (unperiod/duration)*premium)
  return(output)
}

#DAC
dac <- function(unperiod, duration, comm) {
  output <- ifelse(is.na((unperiod/duration)*comm), 0, (unperiod/duration)*comm)
  return(output)
}

#GWP YTD
gwpytd <- function(reptdate, valend, premium) {
  output <- ifelse(year(reptdate) == year(valend) & month(reptdate) <= month(valend), premium, 0)
  return(output)
}

#TOTAL SUMMATION
sum_total <- function(df){
  
res <- df %>% bind_rows(summarise(.,
                                  across(where(is.numeric), sum),
                                  across(where(is.character), ~"TOTAL")))


return(res)
}
