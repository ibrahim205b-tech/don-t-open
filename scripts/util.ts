import fs from 'node:fs';
import readline from 'node:readline';

/** يحمّل ملف .env إن وُجد (من دون تبعيات خارجية). القيم الموجودة في البيئة لها الأولوية. */
export function loadEnvFile(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** يقرأ قيمة سرية من الطرفية من دون إظهارها. */
export function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { console.error('لا توجد طرفية تفاعلية. مرّر القيمة عبر متغير البيئة.'); process.exit(1); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => { if (!muted) out.output.write(s); };
    rl.question(prompt, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    muted = true;
  });
}
