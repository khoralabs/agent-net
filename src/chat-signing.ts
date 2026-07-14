import type { Database } from "bun:sqlite";
import type {
  AppendPostInput,
  AppendPostResult,
  ChatPersistence,
  CommittedPost,
  CompleteStreamedPostInput,
  CompleteStreamedPostResult,
  PreparedAppendPost,
  ScopeRef,
  SignedEnvelope,
} from "@khoralabs/chat-core";
import { canonicalSignedPostVersionPayload, signedPayloadBytes } from "@khoralabs/chat-core";
import { prepareAppendPost } from "@khoralabs/chat-persistence";
import type { RelaySigner } from "@khoralabs/relay-crypto";
import { ed25519PublicKeyBytesFromDid } from "@khoralabs/relay-crypto";
import { verifyAsync } from "@noble/ed25519";

export const HARNESS_CHAT_SIGNATURE_ALGORITHM = "ed25519";

function signatureBytesToB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function signatureBytesFromB64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function preparedToSignable(prepared: PreparedAppendPost) {
  return {
    postId: prepared.postId,
    versionId: prepared.versionId,
    threadId: prepared.threadId,
    author: prepared.author,
    role: prepared.message.role,
    parts: prepared.message.parts,
    metadata: prepared.message.metadata,
    mentions: prepared.mentions,
    model: prepared.model,
    usage: prepared.usage,
    parentVersionId: prepared.parentVersionId,
    previousPostVersionId: prepared.previousPostVersionId,
    contentHash: prepared.contentHash,
    lineageHash: prepared.lineageHash,
  };
}

export function readPreviousPostVersion(
  db: Database,
  threadId: string,
): { id: string; lineageHash: string } | null {
  const thread = db
    .prepare("SELECT default_head_id FROM chat_threads WHERE id = ?")
    .get(threadId) as { default_head_id: string | null } | null;
  if (!thread?.default_head_id) return null;

  const head = db
    .prepare("SELECT head_post_version_id FROM chat_thread_heads WHERE id = ?")
    .get(thread.default_head_id) as { head_post_version_id: string } | null;
  if (!head) return null;

  const version = db
    .prepare("SELECT id, lineage_hash FROM chat_post_versions WHERE id = ?")
    .get(head.head_post_version_id) as { id: string; lineage_hash: string } | null;
  return version ? { id: version.id, lineageHash: version.lineage_hash } : null;
}

export function prepareSignedAppendPost(db: Database, input: AppendPostInput): PreparedAppendPost {
  const previous = readPreviousPostVersion(db, input.threadId);
  return prepareAppendPost({
    ...input,
    previousPostVersionId: previous?.id ?? null,
    previousLineageHash: previous?.lineageHash ?? null,
  });
}

export async function signPreparedAppendPost(
  signer: RelaySigner,
  author: ScopeRef,
  prepared: PreparedAppendPost,
): Promise<SignedEnvelope> {
  if (author.type !== "agent" || author.id !== signer.did) {
    throw new Error("author must match signing agent");
  }

  const payload = canonicalSignedPostVersionPayload(preparedToSignable(prepared));
  const signature = await signer.sign(signedPayloadBytes(payload));
  return {
    algorithm: HARNESS_CHAT_SIGNATURE_ALGORITHM,
    signer: author,
    signature: signatureBytesToB64Url(signature),
    signedAtMs: Date.now(),
  };
}

export async function verifyAppendPostSignature(
  prepared: PreparedAppendPost,
  author: ScopeRef,
  envelope: SignedEnvelope,
): Promise<boolean> {
  if (envelope.algorithm !== HARNESS_CHAT_SIGNATURE_ALGORITHM) return false;
  if (envelope.signer.type !== author.type || envelope.signer.id !== author.id) return false;
  if (author.type !== "agent") return false;

  const payload = canonicalSignedPostVersionPayload(preparedToSignable(prepared));
  const pubKey = ed25519PublicKeyBytesFromDid(envelope.signer.id);
  return verifyAsync(
    signatureBytesFromB64Url(envelope.signature),
    signedPayloadBytes(payload),
    pubKey,
  );
}

export async function assertValidAppendSignature(
  prepared: PreparedAppendPost,
  author: ScopeRef,
  envelope: SignedEnvelope,
): Promise<void> {
  const ok = await verifyAppendPostSignature(prepared, author, envelope);
  if (!ok) {
    throw new Error("invalid post signature");
  }
}

export function withSignedAppendGate(persistence: ChatPersistence, db: Database): ChatPersistence {
  const baseAppendPost = persistence.appendPost.bind(persistence);
  return Object.assign(persistence, {
    async appendPost(input: AppendPostInput): Promise<AppendPostResult> {
      if (!input.signature) {
        throw new Error("appendPost requires a signed envelope");
      }
      const prepared = prepareSignedAppendPost(db, input);
      await assertValidAppendSignature(prepared, input.author, input.signature);
      return baseAppendPost(input);
    },
  });
}

type PostVersionRow = {
  id: string;
  post_id: string;
  thread_id: string;
  author_scope_type: ScopeRef["type"];
  author_scope_id: string;
  message: string;
  mentions: string | null;
  model: string | null;
  usage: string | null;
  content_hash: string;
  lineage_hash: string;
  previous_post_version_id: string | null;
  signature: string | null;
  created_at_ms: number;
};

function readPostVersionRow(db: Database, versionId: string): PostVersionRow | null {
  return db
    .prepare(
      `SELECT id, post_id, thread_id, author_scope_type, author_scope_id, message, mentions, model, usage,
              content_hash, lineage_hash, previous_post_version_id, signature, created_at_ms
       FROM chat_post_versions WHERE id = ?`,
    )
    .get(versionId) as PostVersionRow | null;
}

function preparedFromVersionRow(db: Database, row: PostVersionRow): PreparedAppendPost {
  const previousLineageHash = row.previous_post_version_id
    ? ((
        db
          .prepare("SELECT lineage_hash FROM chat_post_versions WHERE id = ?")
          .get(row.previous_post_version_id) as { lineage_hash: string } | null
      )?.lineage_hash ?? null)
    : null;

  return {
    versionId: row.id,
    postId: row.post_id,
    threadId: row.thread_id,
    author: { type: row.author_scope_type, id: row.author_scope_id },
    message: JSON.parse(row.message),
    mentions: row.mentions ? JSON.parse(row.mentions) : undefined,
    model: row.model ? JSON.parse(row.model) : undefined,
    usage: row.usage ? JSON.parse(row.usage) : undefined,
    parentVersionId: null,
    previousPostVersionId: row.previous_post_version_id,
    previousLineageHash,
    contentHash: row.content_hash,
    lineageHash: row.lineage_hash,
    createdAtMs: row.created_at_ms,
  };
}

async function signPostVersion(
  db: Database,
  versionId: string,
  resolveSigner: (did: string) => Promise<RelaySigner | undefined>,
): Promise<SignedEnvelope> {
  const row = readPostVersionRow(db, versionId);
  if (!row) throw new Error(`post version ${versionId} not found`);
  if (row.signature) return JSON.parse(row.signature) as SignedEnvelope;

  const author = { type: row.author_scope_type, id: row.author_scope_id } as ScopeRef;
  if (author.type !== "agent") {
    throw new Error("only agent-authored posts can be signed");
  }

  const signer = await resolveSigner(author.id);
  if (!signer) throw new Error(`no signing key for agent ${author.id}`);

  const prepared = preparedFromVersionRow(db, row);
  const envelope = await signPreparedAppendPost(signer, author, prepared);
  db.prepare("UPDATE chat_post_versions SET signature = ? WHERE id = ?").run(
    JSON.stringify(envelope),
    versionId,
  );
  return envelope;
}

export function withSignedStreamingComplete(
  persistence: ChatPersistence,
  db: Database,
  resolveSigner: (did: string) => Promise<RelaySigner | undefined>,
): ChatPersistence {
  const baseComplete = persistence.completeStreamedPost.bind(persistence);
  return Object.assign(persistence, {
    async completeStreamedPost(
      input: CompleteStreamedPostInput,
    ): Promise<CompleteStreamedPostResult> {
      const result = await baseComplete(input);
      if (!result.ok) return result;

      const envelope = await signPostVersion(db, result.post.versionId, resolveSigner);
      const post: CommittedPost = { ...result.post, signature: envelope };
      return { ok: true, post, head: result.head };
    },
  });
}

export function createSignedChatPersistence(
  persistence: ChatPersistence,
  db: Database,
  resolveSigner: (did: string) => Promise<RelaySigner | undefined>,
): ChatPersistence {
  return withSignedStreamingComplete(withSignedAppendGate(persistence, db), db, resolveSigner);
}
