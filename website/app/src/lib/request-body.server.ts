export class BodyTooLarge extends Error {}
/** Enforce a byte cap while streaming; Content-Length alone is not trusted. */
export async function boundedBytes(request:Request|Response,max=16384){
 if(Number(request.headers.get('Content-Length')||0)>max){await request.body?.cancel();throw new BodyTooLarge('Body too large');}
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>max){await reader.cancel();throw new BodyTooLarge('Body too large')}parts.push(chunk.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
}
