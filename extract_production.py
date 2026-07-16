import pyodbc
import pandas as pd
import sys

db_path = r"c:\Users\HP\Documents\AADOCs\actuarialservices\actuarialServices\Non_Life_Database.accdb"
conn_str = f"Driver={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={db_path};"

try:
    conn = pyodbc.connect(conn_str)
    query = "SELECT * FROM production"
    df = pd.read_sql(query, conn)
    output_path = r"c:\Users\HP\Documents\AADOCs\actuarialservices\actuarialServices\production.parquet"
    df.to_parquet(output_path, index=False)
    print(f"Successfully saved to {output_path}")
except Exception as e:
    print(f"Error: {e}")
