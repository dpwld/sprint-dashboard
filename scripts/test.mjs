import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const folder=await mkdtemp('.tests-');
try{await build({entryPoints:['tests/service.test.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:`${folder}/service.cjs`});const result=spawnSync(process.execPath,['--test',`${folder}/service.cjs`],{stdio:'inherit'});process.exitCode=result.status??1;}finally{await rm(folder,{recursive:true,force:true});}
