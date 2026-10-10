# Downloads

The website's download buttons serve installers from our own storage at
`https://downloads.litdeck.space`, not from GitHub. Any S3-compatible bucket
works; Cloudflare R2 is the recommended one because it charges nothing for
downloads (egress).

## How a release reaches the site

```
git tag v0.3.3 && git push origin v0.3.3
        │
        ▼  build-release.yml
  builds every platform → draft GitHub release (archive)
                        → uploads to  <bucket>/v0.3.3/
        │
        ▼  you publish the draft release on GitHub
  release-download-guard.yml
     all three installers in v0.3.3/? ── no ──→ release back to draft,
        │ yes                                  /latest/ untouched
        ▼
  copies them to <bucket>/latest/  + writes latest/latest.json
        │
        ▼
  https://downloads.litdeck.space/latest/Litdeck-windows-x64-setup.exe
                                        /Litdeck-macos-arm64.dmg
                                        /Litdeck-linux-x86_64.AppImage
                                        /latest.json   {"version": "0.3.3", …}
```

`/v<version>/` keeps every build of every release (including `.msi`, `.deb`,
`.rpm` and updater files) and is cached for a year. `/latest/` holds only what
the site links to and is cached for five minutes, so a newly published release
reaches visitors within minutes.

Publishing is the human sign-off. Uploading to `/v<version>/` never changes
what the site offers; only a published, complete release does.

## One-time setup (Cloudflare R2)

1. **Create the bucket.** Cloudflare dashboard → R2 → Create bucket, e.g.
   `litdeck-downloads`.
2. **Serve it on the domain.** Bucket → Settings → Custom Domains → Connect
   Domain → `downloads.litdeck.space`. This needs `litdeck.space` on
   Cloudflare DNS. Leave public access through the `r2.dev` URL off.
3. **Create an API token.** R2 → Manage R2 API Tokens → Create API token with
   *Object Read & Write*, scoped to that bucket only. Note the Access Key ID,
   the Secret Access Key, and the S3 endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`).
4. **Add the repository secrets.** GitHub → repo → Settings → Secrets and
   variables → Actions → New repository secret:

   | Secret | Value |
   |---|---|
   | `DOWNLOADS_S3_BUCKET` | `litdeck-downloads` |
   | `DOWNLOADS_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `DOWNLOADS_S3_ACCESS_KEY_ID` | the token's Access Key ID |
   | `DOWNLOADS_S3_SECRET_ACCESS_KEY` | the token's Secret Access Key |
   | `DOWNLOADS_S3_REGION` | leave unset (`auto` is used) |

## Using AWS S3 instead

Create a bucket, put CloudFront (or the bucket's website endpoint) in front of
it on `downloads.litdeck.space`, and create an IAM user allowed only
`s3:PutObject`, `s3:GetObject` and `s3:ListBucket` on that bucket. Set the same
secrets, but leave `DOWNLOADS_S3_ENDPOINT` unset and set `DOWNLOADS_S3_REGION`
to the bucket's region (e.g. `eu-west-2`).

## Cutting a release

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`.
2. `git tag v<version> && git push origin v<version>`.
3. Wait for *Build, Bundle and Release*. If a platform failed, use **Re-run
   failed jobs** (not *Re-run all jobs*, which deletes the other platforms'
   artifacts).
4. Publish the draft release on GitHub. *Release Download Guard* moves it to
   `/latest/`; check that run is green.

To check what the site is serving:

```bash
curl -s https://downloads.litdeck.space/latest/latest.json
```

## Renaming the files

The three `/latest/` file names appear in `web/app/_lib/site.ts`, the
`aliases` list in `.github/workflows/build-release.yml`, and the `required`
list and copy loop in `.github/workflows/release-download-guard.yml`. Change
all of them together.
