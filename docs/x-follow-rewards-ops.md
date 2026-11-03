# X follow reward operations

The API stores proof images in the configured AI video GCS bucket under the separate
`production/x-follow-proofs/` prefix. Object names are random. The API serves proof
images only through the authenticated admin endpoint. The GCS service account must
have create, read, and delete access to this prefix as well as its existing prefixes.

Before deploying the feature, run `node init-users.js` from `api/` against the target
database to create `x_follow_objects` and the reward uniqueness indexes. Deploy the
API and Helm chart together. The Helm `xFollowProofs.enabled` setting mounts the
existing GCS credentials for the API and enables the proof cleanup CronJob. The
chart's `aiVideo.storageProvider` and `aiVideo.gcsBucket` settings select the shared
provider and bucket, even if the AI video feature itself is disabled.

The job runs daily at 03:15 in the Kubernetes scheduler's configured time zone by default, processing at most 100 objects per run. It deletes
proofs 30 days after approval or rejection, while preserving the submission and award
history. Pending proofs remain available. Failed uploads, uploads stuck for over one
hour, and orphaned objects tracked in the database are also eligible for cleanup.
Failures are logged and retried on the next run; a failing object does not prevent
other objects in the batch from being processed. A missing object is treated as
already deleted. Cleanup uses exact object keys and generations under the fixed proof
prefix. The bucket's versioning and soft-delete settings determine when data is
physically removed; application deletion does not bypass those settings.

The old database-image prototype was not deployed. If it was initialized elsewhere,
its `x_follow_proofs` table is not migrated or dropped automatically: inspect any
data there before retiring it.
