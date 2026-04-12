import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const logFile = path.resolve(rootDir, 'logs', 'server.log');
const summaryFile = path.resolve(rootDir, 'logs', 'summary.log');

async function summarizeAndPurge() {
    if (!fs.existsSync(logFile)) {
        console.log('No server.log found.');
        return;
    }

    const rawContent = fs.readFileSync(logFile, 'utf8');
    const lines = rawContent.split('\n').filter(l => l.trim());
    
    if (lines.length === 0) {
        console.log('server.log is empty.');
        return;
    }

    const summaryData: Record<string, { count: number; totalTime: number }> = {};
    const startTimeCount = lines[0].match(/\[(.*?)\]/)?.[1] || new Date().toISOString();
    const endTimeCount = lines[lines.length - 1].match(/\[(.*?)\]/)?.[1] || new Date().toISOString();

    for (const line of lines) {
        // Skip existing batch headers
        if (line.includes('--- SERVER TRAFFIC BATCH ---') || line.startsWith('  ->') || line.includes('\t')) {
            continue;
        }

        // Format: 2026-04-11T02:55:54.584Z [repoview] GET /src/App.tsx -> 200 2ms headers={...}
        const match = line.match(/\[repoview\]\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)\s+->\s+(\d+)\s+(\d+)ms/);
        if (match) {
            const method = match[1];
            const route = match[2];
            const status = match[3];
            const timeStr = match[4];
            const key = `${method} ${route} -> ${status}`;
            const time = parseInt(timeStr, 10);

            if (!summaryData[key]) {
                summaryData[key] = { count: 0, totalTime: 0 };
            }
            summaryData[key].count++;
            summaryData[key].totalTime += time;
        } else {
            // Group typical static assets and components
            const assetMatch = line.match(/\[repoview\]\s+(GET|POST)\s+(\/node_modules\/|\/src\/|.*\.tsx|.*\.ts|.*\.css|.*\.png|.*\.js|.*\.ico).*\s+->\s+(\d+)\s+(\d+)ms/);
            if (assetMatch) {
                const method = assetMatch[1];
                const status = assetMatch[3];
                const timeStr = assetMatch[4];
                const key = `${method} [Static Assets & Components] -> ${status}`;
                const time = parseInt(timeStr, 10);
                if (!summaryData[key]) summaryData[key] = { count: 0, totalTime: 0 };
                summaryData[key].count++;
                summaryData[key].totalTime += time;
            }
        }
    }

    const summaryEntries = Object.entries(summaryData);
    if (summaryEntries.length > 0) {
        let summaryText = `[${startTimeCount} to ${endTimeCount}] === LOG SUMMARY (${lines.length} lines processed) ===\n`;
        for (const [key, data] of summaryEntries) {
            const avg = Math.round(data.totalTime / data.count);
            summaryText += `  -> ${data.count}x\t${key}\t(avg ${avg}ms)\n`;
        }
        summaryText += `\n`;

        fs.appendFileSync(summaryFile, summaryText);
        console.log(`Appended summary of ${lines.length} lines to logs/summary.log`);
    }

    // Purge the log file
    fs.writeFileSync(logFile, '');
    console.log('server.log has been purged.');
}

summarizeAndPurge().catch(console.error);