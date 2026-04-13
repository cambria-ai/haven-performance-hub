import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { mergePerformanceData } from '@/lib/report-data';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const uploadedBy = formData.get('uploadedBy') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const parsedData: any = {};
    
    workbook.SheetNames.forEach((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, { header: 1 });
      
      if (data.length > 0) {
        const headers = (data[0] ?? []).map((cell) => String(cell ?? ''));
        const rows = data.slice(1).map((row) => {
          const obj: any = {};
          headers.forEach((header, i) => {
            if (header && row[i] !== undefined) {
              obj[header.trim()] = row[i];
            }
          });
          return obj;
        });
        
        parsedData[sheetName] = {
          headers,
          rows,
          rowCount: rows.length
        };
      }
    });

    const dataPath = path.join(process.cwd(), 'data', 'performance-data.json');
    const uploadRecord = {
      filename: file.name,
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      sheetCount: workbook.SheetNames.length,
      sheets: workbook.SheetNames,
    };

    let existingData: any = { agents: {}, uploads: [], leadTracking: {} };
    try {
      existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    } catch {
      existingData = { agents: {}, uploads: [], leadTracking: {} };
    }

    const mergedData = mergePerformanceData(existingData, parsedData, uploadRecord);

    let persisted = true;
    try {
      fs.writeFileSync(dataPath, JSON.stringify(mergedData, null, 2));
    } catch (persistError) {
      persisted = false;
      console.warn('Upload parsed but could not be persisted to filesystem:', persistError);
    }

    return NextResponse.json({
      success: true,
      message: `Parsed ${workbook.SheetNames.length} sheets`,
      sheets: workbook.SheetNames,
      upload: uploadRecord,
      data: mergedData,
      persisted,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process report file' }, { status: 500 });
  }
}
