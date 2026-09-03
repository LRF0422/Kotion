# Resumable file uploads

Kotion uploads files up to 10 GiB directly from the browser to object storage using multipart upload sessions. File-center remains the authenticated control plane; file bytes do not pass through Nginx, Gateway, or Spring MVC.

## Deployment requirements

1. Apply `backend/knowledgecloud/script/migration/V19__resumable_file_upload.sql` before deploying the new file-center service.
2. Configure MinIO with both endpoints when its internal address is not browser-reachable:

```yaml
oss:
  endpoint: http://minio:9000
  public-endpoint: https://files.example.com
```

`oss.public-endpoint` must be HTTPS in production and must address the same MinIO service/bucket as `oss.endpoint`.
3. Allow the web application origin to send `PUT` requests to the MinIO endpoint and expose the `ETag` response header. MinIO normally supplies the required S3 CORS headers; verify them when a reverse proxy sits in front of MinIO.
4. Configure an object-storage lifecycle rule that aborts incomplete multipart uploads after the operational retention period (recommended: 14 days).
5. Deploy file-center with scheduled cleanup enabled (the checked-in configuration enables upload cleanup and reconciliation).

## Legacy uploads

The original servlet multipart endpoints remain available for compatibility only:

- Maximum file size: 64 MiB
- Maximum multipart request size: 128 MiB

Do not raise these endpoints to the 10 GiB product limit. Large files use direct multipart upload sessions.

## Verification checklist

- Upload a small file and a multi-part file.
- Interrupt a multipart upload, refresh the page, and resume it.
- Verify a wrong re-selected file is rejected before missing parts upload.
- Cancel an upload and verify the provider multipart upload is aborted.
- Verify the browser can read `ETag` from each part response.
- Confirm signed part URLs and Authorization/Cookie headers do not appear in frontend or backend logs.
- Confirm file-center and Gateway memory/temp-disk use does not scale with uploaded file size.
