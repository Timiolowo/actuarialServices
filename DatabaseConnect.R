#-----------------------------------------
# TITLE: DYNAMICALLY LOAD FROM OUR DATABASE
# AUTHOR: TIMILEHIN OLOWOLAFE
# DATE: 2025-06-16 12:31:20 WAT
# VERSION: v1.0
#-----------------------------------------,

#-------------------------------------------
databasefile <- "C:/Users/Olowolafe/OneDrive - axamansard.com/P & C Team/Database/Non_Life_Database.accdb"


DatabaseConnect <- function(selection = NULL, verbose = FALSE) {
  # Load required libraries
  library(tidyverse)
  library(lubridate)
  library(readxl)
  library(openxlsx)
  library(RODBC)
  library(dplyr)
  
  # Show help and exit if user types "help"
  if (tolower(selection) == "help") {
    cat("\n📘 Available Options:\n")
    cat("1: Production Data Only        → Loads Production Data\n")
    cat("2: Paid Claims Only            → Loads Claims Paid Data\n")
    cat("3: Outstanding Claims Only     → Loads Outstanding Claims Data\n")
    cat("4: All Data                    → Loads Production, Paid and Outstanding Data\n")
    cat("5: Paid & Outstanding Claims   → Loads both Paid and Outstanding Data\n")
    cat("0: Cancel                      → Exits without loading any data\n\n")
    return(invisible(NULL))
  }
  
  # Show explanation if verbose is TRUE
  if (verbose) {
    cat("\n📘 Available Options:\n")
    cat("1: Production Data Only        → Loads Production Data\n")
    cat("2: Paid Claims Only            → Loads Claims Paid Data\n")
    cat("3: Outstanding Claims Only     → Loads Outstanding Claims Data\n")
    cat("4: All Data                    → Loads Production, Paid and Outstanding Data\n")
    cat("5: Paid & Outstanding Claims   → Loads both Paid and Outstanding Data\n")
    cat("0: Cancel                      → Exits without loading any data\n\n")
  }
  
  # Prompt if selection not supplied
  if (is.null(selection)) {
    repeat {
      selection <- menu(
        c("Production Data Only", 
          "Paid Claims Only", 
          "Outstanding Claims Only", 
          "All Data", 
          "Paid & Outstanding Claims",
          "Press 0 to Cancel"), 
        title = "Choose the dataset(s) to load:"
      )
      
      if (selection == 0) {
        message("⚠️ Menu cancelled. No data was loaded.")
        return(invisible(NULL))
      }
      
      if (selection %in% 1:5) break
      
      message("❌ Invalid selection. Please choose a valid option (1 to 5).\n")
    }
  }
  
  # Validate script-based selection
  if (!(selection %in% 1:5)) {
    message("❌ Invalid selection passed as argument. Must be 1 to 5.")
    return(invisible(NULL))
  }
  
  # Set DB path
  db <- databasefile
  con <- odbcConnectAccess2007(db)
  
  # Conditional loading and assign to global environment
  if (selection == 1) {
    prod_data <- sqlQuery(con, "SELECT * FROM Data")
    assign("prod_data", prod_data, envir = .GlobalEnv)
    message("✔ Loaded Production Data as `prod_data`")
    
  } else if (selection == 2) {
    claims_data <- sqlQuery(con, "SELECT * FROM Claims_Paid")
    assign("claims_data", claims_data, envir = .GlobalEnv)
    message("✔ Loaded Paid Claims Data as `claims_data`")
    
  } else if (selection == 3) {
    osc_data <- sqlQuery(con, "SELECT * FROM Outstanding_Claims_Naira_AsAt")
    assign("osc_data", osc_data, envir = .GlobalEnv)
    message("✔ Loaded Outstanding Claims Data as `osc_data`")
    
  } else if (selection == 4) {
    prod_data <- sqlQuery(con, "SELECT * FROM Data")
    claims_data <- sqlQuery(con, "SELECT * FROM Claims_Paid")
    osc_data <- sqlQuery(con, "SELECT * FROM Outstanding_Claims_Naira_AsAt")
    assign("prod_data", prod_data, envir = .GlobalEnv)
    assign("claims_data", claims_data, envir = .GlobalEnv)
    assign("osc_data", osc_data, envir = .GlobalEnv)
    message("✔ Loaded all data: `prod_data`, `claims_data`, `osc_data`")
    
  } else if (selection == 5) {
    claims_data <- sqlQuery(con, "SELECT * FROM Claims_Paid")
    osc_data <- sqlQuery(con, "SELECT * FROM Outstanding_Claims_Naira_AsAt")
    assign("claims_data", claims_data, envir = .GlobalEnv)
    assign("osc_data", osc_data, envir = .GlobalEnv)
    message("✔ Loaded `claims_data` and `osc_data`")
  }
  
  # Close DB connection
  odbcClose(con)
  
  # Return nothing (silent)
  invisible(NULL)
}
