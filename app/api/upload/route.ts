import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth-helpers';
import { saveCurrentSnapshot, archiveCurrentSnapshot } from '@/lib/snapshot';
import { normalizeToSnapshot } from '@/lib/normalizer';

export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const auth = getAuthFromRequest(request);
    
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required for uploads' },
        { status: 403 }
      );
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Parse Excel file
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const parsedData: Record<string, any> = {};
    
    workbook.SheetNames.forEach((sheetName) => {
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

    // Archive current snapshot before creating new one
    archiveCurrentSnapshot();
    
    // Normalize to snapshot format
    const sourceFiles = [file.name, ...workbook.SheetNames];
    const result = normalizeToSnapshot(parsedData, auth.agentId, sourceFiles);
    
    // Save new snapshot
    saveCurrentSnapshot(result.snapshot);
    
    return NextResponse.json({
      success: true,
      message: `Processed ${workbook.SheetNames.length} sheets`,
      sheets: workbook.SheetNames,
      snapshotId: result.snapshot.metadata.id,
      agentCount: result.snapshot.metadata.agentCount,
      transactionCount: result.snapshot.metadata.transactionCount,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to process report file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
