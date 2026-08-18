import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const BUCKET = "character-art";
const STAGE_COLUMNS = ["art_url_stage1", "art_url_stage2", "art_url_stage3"] as const;

async function migrateOne(characterId: string, stageColumn: string, sourceUrl: string) {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = `${characterId}/${stageColumn}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });

  if (uploadError) {
    throw new Error(`Upload failed for ${path}: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

Deno.serve(async () => {
  const { data: characters, error } = await supabase
    .from("foodiemon_characters")
    .select("id, art_url_stage1, art_url_stage2, art_url_stage3");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: Record<string, unknown>[] = [];

  for (const character of characters ?? []) {
    const updates: Record<string, string> = {};
    for (const column of STAGE_COLUMNS) {
      const sourceUrl = (character as any)[column];
      // Skip empty values and anything already migrated (idempotent — safe to re-run)
      if (!sourceUrl || sourceUrl.includes("supabase.co/storage")) {
        continue;
      }
      try {
        const newUrl = await migrateOne(character.id, column, sourceUrl);
        updates[column] = newUrl;
      } catch (err) {
        results.push({ character_id: character.id, column, error: String(err) });
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("foodiemon_characters")
        .update(updates)
        .eq("id", character.id);

      results.push({
        character_id: character.id,
        updated: Object.keys(updates),
        error: updateError?.message ?? null,
      });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { "content-type": "application/json" },
  });
});