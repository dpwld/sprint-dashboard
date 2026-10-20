/** Accept the folder ID or the Google Drive folder URL used by the original browser. */
export function driveFolderId(value:string):string|null {
 if(/^[-\w]+$/.test(value))return value;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='drive.google.com')return null;const id=url.pathname.match(/\/folders\/([-\w]+)/)?.[1]??url.searchParams.get('id');return id&&/^[-\w]+$/.test(id)?id:null;}catch{return null;}
}
