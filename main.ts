import { parseSnapshot, buildRadar, boardIssue, dataScript } from './lib/model.ts';
import { buildDossier, PLAIN_NAME } from './vendor/makefun-board.ts';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Main function for the token radar CLI tool.
 * Parses input, builds the radar model, validates the board, and exports results.
 */
function main() {
    const args = process.argv.slice(2);
    let input = '/input';
    let output = process.env.MAKEFUN_OUTPUT_DIR || '/output';

    // Parse command line arguments for --input and --output
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' || args[i].startsWith('--input=')) {
            input = args[i].includes('=') ? args[i].split('=')[1] : args[++i];
        } else if (args[i] === '--output' || args[i].startsWith('--output=')) {
            output = args[i].includes('=') ? args[i].split('=')[1] : args[++i];
        }
    }

    // Determine the snapshot path
    const snapshotPath = input.endsWith('.json') ? input : join(input, 'snapshot.json');
    if (!existsSync(snapshotPath)) {
        process.stderr.write(`token radar: no snapshot at ${snapshotPath}\n`);
        process.exit(2);
    }

    // Load and process snapshot
    const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
    const { board, radar } = buildRadar(snapshot);
    const issue = boardIssue(board, snapshot);
    if (issue) {
        process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
        process.exit(1);
    }

    // Prepare output directory
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'board.json'), JSON.stringify({ rows: board }) + '\n');
    writeFileSync(join(output, 'data.js'), dataScript(radar));

    /**
     * Helper to copy files from source to destination, ignoring dot files.
     * Validates filenames in screenshots directory.
     */
    const copyDir = (src: string, dest: string) => {
        mkdirSync(dest, { recursive: true });
        for (const file of readdirSync(src)) {
            if (file.startsWith('.')) continue;
            if (src.endsWith('screenshots')) {
                if (!PLAIN_NAME.test(file)) {
                    process.stderr.write(`token radar: invalid filename ${file}\n`);
                    process.exit(1);
                }
            }
            copyFileSync(join(src, file), join(dest, file));
        }
    };

    // Copy resources
    copyDir(resolve(__dirname, 'dashboard'), join(output, 'dashboard'));
    copyDir(resolve(__dirname, 'screenshots'), join(output, 'screenshots'));

    // Validate screenshot count
    if (readdirSync(join(output, 'screenshots')).length < 3) {
        process.stderr.write('token radar: less than 3 screenshots\n');
        process.exit(1);
    }

    // Write dossier
    const dossier = buildDossier(output, { 
        text_max_bytes: 65536, 
        screenshots: { max: 4, max_bytes: 524288 }, 
        dashboard: { max_files: 400, max_bytes: 4194304 } 
    });
    writeFileSync(join(output, 'dossier.json'), dossier);

    // Final output summary
    console.log(`protocols: ${snapshot.protocols.length}, watchlist: ${snapshot.watchlist.length}, rows: ${board.length}, radar early: ${(radar as any).early_size}, live: ${(radar as any).live_size}`);
    console.log(`written: board.json, data.js, dossier.json`);
}

main();
