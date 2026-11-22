#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, parse } from 'node:path';

/**
 * Escapes a string for CSV compliance (RFC 4180).
 * Handles escaping of double quotes, commas, and newlines.
 *
 * @param {any} val - The value to escape.
 * @returns {string} - The escaped CSV-compliant string.
 */
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // According to RFC 4180, fields containing special characters must be
  // enclosed in double quotes, and internal double quotes must be escaped
  // by preceding them with another double quote.
  if (
    str.includes('"') ||
    str.includes(',') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts a board row object into a CSV row string.
 * Guards against missing or unexpected data types for fields
 * like rank, slug, name, category, implied_value_usd, confidence, and farm_steps.
 *
 * @param {object} row - The row data from board.json.
 * @returns {string} - A single line of CSV.
 */
function toRow(row) {
  const {
    rank = 'N/A',
    slug = 'N/A',
    name = 'N/A',
    category = 'N/A',
    implied_value_usd = 0,
    confidence = 0,
    farm_steps = []
  } = row;

  // Ensure farm_steps is always an array
  const steps = Array.isArray(farm_steps) ? farm_steps : [];

  const arr = [
    rank,
    slug,
    name,
    category,
    implied_value_usd,
    confidence,
    steps.join(' | ')
  ];

  return arr.map(csvEscape).join(',');
}

/**
 * Summarizes board rows by category.
 * Calculates count, total, mean, and max for implied_value_usd.
 *
 * @param {Array<object>} rows - List of row objects.
 * @returns {Array<object>} - List of summary statistics per category.
 */
function summarizeByCategory(rows) {
  const summary = {};

  for (const row of rows) {
    const cat = row.category ?? 'Uncategorized';
    const val = Number(row.implied_value_usd) || 0;

    if (!summary[cat]) {
      summary[cat] = {
        count: 0,
        total: 0,
        max: 0
      };
    }

    summary[cat].count += 1;
    summary[cat].total += val;
    if (val > summary[cat].max) {
      summary[cat].max = val;
    }
  }

  // Convert summary object to array and calculate mean
  return Object.entries(summary).map(([category, stats]) => ({
    category,
    count: stats.count,
    total: stats.total,
    mean: stats.count > 0 ? stats.total / stats.count : 0,
    max: stats.max
  }));
}

/**
 * Main CLI application logic.
 * Parses command-line arguments, validates input files, and performs
 * CSV file generation for the board data and the summary statistics.
 */
function main() {
  const args = process.argv.slice(2);

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/export-csv.mjs <board.json> [out.csv]');
    process.exit(0);
  }

  // Validate argument count
  if (args.length < 1) {
    console.error('Error: Missing <board.json> argument.');
    process.exit(1);
  }

  const inputPath = resolve(args[0]);
  const outputPath = resolve(args[1] || 'board.csv');

  // Load and parse input JSON
  let data;
  try {
    data = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch (err) {
    console.error(`Error: Could not read or parse JSON file: ${err.message}`);
    process.exit(1);
  }

  // Validate JSON schema
  if (!data || !Array.isArray(data.rows)) {
    console.error('Error: Invalid JSON format, expected {rows: []}.');
    process.exit(1);
  }

  // Generate main CSV
  const csvRows = [
    'rank,slug,name,category,implied_value_usd,confidence,farm_steps',
    ...data.rows.map(toRow)
  ];

  try {
    writeFileSync(outputPath, csvRows.join('\n') + '\n');
    console.log(`Successfully wrote: ${outputPath}`);
  } catch (err) {
    console.error(`Error: Could not write CSV: ${err.message}`);
    process.exit(1);
  }

  // Handle Summary CSV Generation
  const { dir, name } = parse(outputPath);
  const summaryPath = resolve(dir, `${name}-summary.csv`);

  const summaryStats = summarizeByCategory(data.rows);
  const summaryCsvRows = [
    'category,count,total,mean,max',
    ...summaryStats.map(s => [s.category, s.count, s.total, s.mean, s.max].map(csvEscape).join(','))
  ];

  // Write Summary CSV
  try {
    writeFileSync(summaryPath, summaryCsvRows.join('\n') + '\n');
    console.log(`Successfully wrote: ${summaryPath}`);
  } catch (err) {
    console.error(`Error: Could not write summary CSV: ${err.message}`);
    process.exit(1);
  }
}

// Execute the script
main();
