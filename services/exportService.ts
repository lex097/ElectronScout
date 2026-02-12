// services/exportService.ts
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { supabaseSyncService } from './supabase.sync';
import { ACTIVE_GAME_CONFIG } from '../config/gameConfig';

interface ExportMatch {
  match_number: number;
  team_number: number;
  scout_name: string;
  game_year: number;
  date: string;
  calculated_points: number;
  notes: string;
  [key: string]: any; // For metric columns
}

export class ExportService {
  /**
   * Escape CSV value (handle commas, quotes, newlines)
   */
  private escapeCSV(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Generate CSV string from data
   */
  private generateCSV(rows: any[][], headers: string[]): string {
    // Convert headers to CSV
    const headerRow = headers.map(h => this.escapeCSV(h)).join(',');
    
    // Convert data rows to CSV
    const dataRows = rows.map(row => 
      row.map(cell => this.escapeCSV(cell)).join(',')
    ).join('\n');

    return `${headerRow}\n${dataRows}`;
  }

  /**
   * Export team's scouting data to CSV
   * Only exports data for the current team (filtered by team_id)
   */
  async exportTeamDataToCSV(eventKey?: string): Promise<string | null> {
    try {
      // Fetch matches for current team only (already filtered by team_id)
      // Use event_key directly (no conversion needed)
      const matches = await supabaseSyncService.getMatches(eventKey);
      
      if (!matches || matches.length === 0) {
        throw new Error('No data to export');
      }

      // Get all metric IDs from game config to create consistent columns
      const metricIds: string[] = [];
      const metricLabels: Record<string, string> = {};
      
      ACTIVE_GAME_CONFIG.phases.forEach(phase => {
        phase.metrics.forEach(metric => {
          metricIds.push(metric.id);
          metricLabels[metric.id] = metric.label;
        });
      });

      // Prepare data for CSV - flatten metrics into columns
      const exportData: ExportMatch[] = matches.map((match: any) => {
        const row: ExportMatch = {
          match_number: match.match_number,
          team_number: match.team_number,
          scout_name: match.scout_name || 'Unknown',
          game_year: match.game_year,
          date: format(new Date(match.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          calculated_points: match.calculated_points || 0,
          notes: match.notes || '',
        };

        // Flatten metrics into separate columns
        if (match.metrics && typeof match.metrics === 'object') {
          metricIds.forEach(metricId => {
            const value = match.metrics[metricId];
            // Format the value appropriately
            if (value === null || value === undefined) {
              row[metricId] = '';
            } else if (typeof value === 'boolean') {
              row[metricId] = value ? 'Yes' : 'No';
            } else {
              row[metricId] = value;
            }
          });
        } else {
          // If metrics is not an object, fill with empty strings
          metricIds.forEach(metricId => {
            row[metricId] = '';
          });
        }

        return row;
      });

      // Define CSV columns with proper headers
      const headers = [
        'Match Number',
        'Team Number',
        'Scout Name',
        'Game Year',
        'Date',
        'Calculated Points',
        ...metricIds.map(id => metricLabels[id] || id), // Use metric labels as column headers
        'Notes',
      ];

      // Map data to column order
      const csvRows = exportData.map(match => [
        match.match_number,
        match.team_number,
        match.scout_name,
        match.game_year,
        match.date,
        match.calculated_points,
        ...metricIds.map(id => match[id] ?? ''),
        match.notes || '',
      ]);

      // Generate CSV string
      const csvContent = this.generateCSV(csvRows, headers);

      // Create filename with timestamp
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const filename = `scouting_data_${timestamp}.csv`;

      // Create file using new File API
      const file = new File(Paths.document, filename);
      
      // Try to create the file, or use existing if it already exists
      try {
        file.create(); // Create the file (can throw if already exists)
      } catch (error: any) {
        // If file already exists, that's okay - we'll overwrite it with write()
        // The timestamp should make collisions extremely unlikely anyway
        console.log('File may already exist, continuing with write:', error?.message);
      }
      
      file.write(csvContent); // Write the CSV content (overwrites if file exists)

      console.log('CSV file created at:', file.uri);
      return file.uri;
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  /**
   * Share CSV file using native share dialog
   */
  async shareCSVFile(fileUri: string): Promise<void> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (!isAvailable) {
        throw new Error('Sharing is not available on this device');
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Scouting Data',
      });
    } catch (error) {
      console.error('Share failed:', error);
      throw error;
    }
  }

  /**
   * Export and share in one call
   */
  async exportAndShare(eventKey?: string): Promise<void> {
    try {
      const fileUri = await this.exportTeamDataToCSV(eventKey);
      if (fileUri) {
        await this.shareCSVFile(fileUri);
      }
    } catch (error) {
      console.error('Export and share failed:', error);
      throw error;
    }
  }
}

export const exportService = new ExportService();

