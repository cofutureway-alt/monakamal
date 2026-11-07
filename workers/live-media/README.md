# mona-live-media

Private gateway in front of the R2 bucket `mona-live-recordings`. Nothing in the
bucket is publicly readable; every byte goes through this Worker.

## Two auth schemes

| Caller | Scheme | Where |
|---|---|---|
| ingest worker (edge function) | `X-Ts` (unix s) + `X-Signature = HMAC_SHA256(INGEST_SECRET, "<ts>.<rawBody>")`, rejected when `|now − ts| > 300 s` | `/ingest/*` |
| browser | query `u`, `exp`, `sig = HMAC_SHA256(MEDIA_SIGNING_SECRET, "<METHOD>|<key>|<u>|<exp>")` | `/media/*`, `/upload/*` |

Both are compared in constant time. Nothing is logged with the query string.

## Routes

| Route | Purpose |
|---|---|
| `POST /ingest/create` | start a multipart upload, returns `uploadId` |
| `POST /ingest/part` | stream one ranged source chunk into R2; `{rangeUnsupported:true}` when the source ignores `Range` |
| `POST /ingest/complete` | finish the multipart upload |
| `POST /ingest/abort` | discard a multipart upload |
| `POST /ingest/single` | single streaming put for sources without range support (≤ 4.5 GiB) |
| `GET|HEAD /media/<key>` | ranged playback (`206` + `Content-Range`) |
| `PUT /upload/<key>` | direct manual upload, `Content-Length` required, max 5 GiB |

## Ops

```bash
npx wrangler secret put INGEST_SECRET          # same value as the edge secret
npx wrangler secret put MEDIA_SIGNING_SECRET   # same value as the edge secret
npx wrangler deploy
npx wrangler r2 bucket cors set mona-live-recordings --file r2-cors.json
```

`MEDIA_BASE_URL` (the deployed `*.workers.dev` origin, no trailing slash) is an
edge-function secret used to build signed playback URLs.

The bucket stays private: no custom domain, no `r2.dev`, no public access rule.
