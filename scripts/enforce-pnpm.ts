const execPath = process.env['npm_execpath'] ?? '';

if (execPath && !/pnpm/i.test(execPath)) {
  process.stderr.write(
    [
      'Error: This repository uses pnpm exclusively.',
      'Do not use npm, npx, or yarn.',
      'Run `pnpm install` (or `pnpm exec <cmd>`) instead.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
