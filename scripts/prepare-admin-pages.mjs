import { copyFileSync } from 'node:fs';

copyFileSync('dist-admin/admin.html', 'dist-admin/index.html');
