import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import fs from 'fs';

async function test() {
  const buffer = fs.readFileSync('../production.parquet');
  const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  
  // Test getting metadata
  const metadata = await parquetMetadataAsync(arrayBuf);
  console.log("Columns:", metadata.schema.map(s => s.name));
  
  await parquetRead({
    file: arrayBuf,
    onComplete: (data) => {
      console.log("Data is Array?", Array.isArray(data));
      console.log("Data length:", data.length);
      console.log("Data[0]:", data[0]);
    }
  });
}
test();
