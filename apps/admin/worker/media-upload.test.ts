import { describe, expect, it, vi } from "vitest";
import { uploadManagedMedia } from "./media-upload";
import type { FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";

const env = { CLOUDINARY_CLOUD_NAME: "test-cloud", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" } as Env;
function request(key = "00000000-0000-4000-8000-000000000000", change = false) {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82],12);
  new DataView(bytes.buffer).setUint32(16, change ? 2 : 1); new DataView(bytes.buffer).setUint32(20, 1);
  const body = new FormData(); body.append("file",new File([bytes],"dog.png",{type:"image/png"}));
  return new Request("https://admin.test/api/admin/media/upload",{method:"POST",headers:{"Content-Length":"300","Idempotency-Key":key},body});
}
function repository() {
  const documents = new Map<string, Record<string, unknown>>();
  const repo = {
    getDocument: vi.fn(async(path: string) => documents.has(path) ? {id:path.split("/").at(-1)!,name:path,data:documents.get(path)!,updateTime:"2026-11-17T00:00:00Z"} : null),
    commitAtomic: vi.fn(async(writes: {path:string;data?:Record<string,unknown>;kind:string}[]) => {
      for(const write of writes) {
        if(write.kind==="create" && documents.has(write.path)) throw new Error("conflict");
        documents.set(write.path,{...documents.get(write.path),...write.data});
      }
      return {};
    }),
  };
  return { repo: repo as Pick<FirestoreRestClient,"getDocument"|"commitAtomic">, documents };
}
function payload(publicId: string) {
  return { public_id:publicId,resource_type:"image",bytes:100,format:"png",width:1,height:1,secure_url:`https://res.cloudinary.com/test-cloud/image/upload/v1/${publicId}.png` };
}
describe("durable upload commands", () => {
  it("persists identity before upload and reconciles a lost response without uploading twice",async()=> {
    const {repo,documents}=repository(); let uploads=0;
    const fetcher = vi.fn(async(input: RequestInfo|URL) => {
      if(String(input).endsWith("/image/upload")) { uploads++; expect(documents.size).toBe(1); throw new Error("response lost"); }
      const command=[...documents.values()][0]!;
      return Response.json(payload(String(command.publicId)));
    }) as typeof fetch;
    await expect(uploadManagedMedia(request(),env,undefined,fetcher,repo)).rejects.toMatchObject({status:502});
    const recovered=await uploadManagedMedia(request(),env,undefined,fetcher,repo);
    expect(recovered.bytes).toBe(100); expect(uploads).toBe(1);
    await expect(uploadManagedMedia(request(),env,undefined,fetcher,repo)).resolves.toEqual(recovered);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(uploadManagedMedia(request(undefined,true),env,undefined,fetcher,repo)).rejects.toMatchObject({status:409});
  });
  it("keeps a missing resource pending instead of creating another asset",async()=> {
    const {repo}=repository(); let calls=0;
    const fetcher = (async()=> { calls++; if(calls===1) throw new Error("lost"); return Response.json({error:{message:"missing"}},{status:404}); }) as typeof fetch;
    await expect(uploadManagedMedia(request(),env,undefined,fetcher,repo)).rejects.toMatchObject({status:502});
    await expect(uploadManagedMedia(request(),env,undefined,fetcher,repo)).rejects.toMatchObject({status:503});
    expect(calls).toBe(2);
  });
});
