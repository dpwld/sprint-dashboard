import { uploadPmFile, pmFileUrl } from './pm';
export const uploadDocFile = (file: File, _folder?: string) => uploadPmFile(file);
export const docFileUrl = pmFileUrl;
