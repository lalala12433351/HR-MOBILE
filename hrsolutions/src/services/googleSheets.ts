import { listDriveFiles, DriveFile } from './googleDrive';

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  properties: {
    title: string;
    locale?: string;
    timeZone?: string;
  };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      gridProperties?: {
        rowCount: number;
        columnCount: number;
      };
    };
  }>;
  spreadsheetUrl?: string;
}

export interface ValueRange {
  range: string;
  majorDimension?: 'ROWS' | 'COLUMNS';
  values: string[][];
}

/**
 * List all Google Sheets spreadsheets from Google Drive
 */
export const listSpreadsheetsFromDrive = async (accessToken: string): Promise<DriveFile[]> => {
  return await listDriveFiles(
    accessToken,
    "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    30
  );
};

/**
 * Create a new Google Sheet Spreadsheet via Google Sheets API v4
 */
export const createSpreadsheet = async (
  accessToken: string,
  title: string,
  initialData?: { sheetName?: string; headers?: string[]; rows?: string[][] }
): Promise<SpreadsheetMetadata> => {
  const sheetTitle = initialData?.sheetName || 'Sheet1';
  
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: sheetTitle,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create Google Spreadsheet (${response.status})`);
  }

  const spreadsheet: SpreadsheetMetadata = await response.json();

  // If initial headers/rows provided, populate them
  if (initialData?.headers && initialData.headers.length > 0) {
    const allValues = [initialData.headers, ...(initialData.rows || [])];
    await updateSpreadsheetValues(
      accessToken,
      spreadsheet.spreadsheetId,
      `${sheetTitle}!A1`,
      allValues
    );
  }

  return spreadsheet;
};

/**
 * Fetch spreadsheet metadata and sheet list
 */
export const getSpreadsheetMetadata = async (
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> => {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to fetch Spreadsheet metadata (${response.status})`);
  }

  return await response.json();
};

/**
 * Fetch values for a given range (e.g. "Sheet1!A1:Z100")
 */
export const getSpreadsheetValues = async (
  accessToken: string,
  spreadsheetId: string,
  range: string = 'A1:Z100'
): Promise<ValueRange> => {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to fetch Spreadsheet values (${response.status})`);
  }

  return await response.json();
};

/**
 * Update values in a specific range
 */
export const updateSpreadsheetValues = async (
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<any> => {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to update Spreadsheet values (${response.status})`);
  }

  return await response.json();
};

/**
 * Append rows to an existing spreadsheet (e.g., adding financial expense or timesheet record)
 */
export const appendSpreadsheetValues = async (
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<any> => {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to append Spreadsheet values (${response.status})`);
  }

  return await response.json();
};
