# Compatibility engine and AI layer

## Deterministic scoring (`src/lib/matching/scoring.ts`)

The score is a pure function of structured profile data: identical inputs always produce identical output. It is computed from the viewer's perspective ("you") against a candidate ("they").

| Factor | Default weight | Inputs | Notes |
|---|---|---|---|
| Complementary skills | 25% | their strengths vs your requested partner skills ∪ your development areas, and vice versa | Rewards covering each other's gaps, not duplication. |
| Industry interests | 20% | overlap of industries of interest; partner-industry preferences | Interest only. |
| Relevant experience and capabilities | 15% | their past industries vs your interests (and vice versa); new strengths each brings | Experience is kept separate from interest. Having no prior industry experience affects only half of this factor. |
| Working style | 20% | working style, decision-making, ownership, ambiguity, execution, pressure | Identical = 1.0, flexible answer = 0.85, opposite poles = 0.6. Differences are shown as discussion points, never as penalties, and no style scores higher on its own. |
| Career and learning goals | 10% | career objective (same / related group / undecided / different) and partner expectations | |
| Communication and disagreements | 10% | communication, conflict, feedback | |

Weights live in `src/lib/matching/weights.ts` and must sum to 1.

**Incomplete data.** Each factor returns `null` when its inputs are missing. If the factors that can be computed carry less than 60% of the total weight, the result is "Not enough information yet" rather than a misleading low score.

**No false precision.** Scores are rounded to the nearest 5 and always shown with a band ("Strong potential fit" ≥ 75, "Promising fit" ≥ 60, otherwise "Worth exploring") and the label "indicative".

**Nobody is hidden.** The score orders the discovery deck (ties broken by id); it never filters anyone out. Students control filters themselves.

### Assumptions (initial product defaults, not validated science)

- Complementary skills matter more than identical skills for a two-person team covering a broad business problem.
- Shared industry curiosity helps motivation; experience in someone else's area of interest adds value.
- Working-style differences can be productive or challenging depending on how a pair agrees to work, so they sit mid-range.
- These weights should be revisited once the programme has outcome data, such as partnership satisfaction surveys.

## Pair insights (`src/lib/matching/insights.ts`)

Deterministic "team composition" observations:

- what each student brings that the other asked for
- overlapping strengths
- shared interests
- experience that meets the other's curiosity
- core BSL capabilities neither lists (Strategy, Research, Finance, Marketing, Data analytics, Communication)
- working-style differences
- up to five practical questions to discuss before confirming

The UI labels these "Observations from your submitted profiles".

## AI layer (`src/lib/ai/`)

- **Provider abstraction** (`provider.ts`). Features depend on `AIProvider.generate({ system, prompt, schema, jsonSchema })`. `config.ts` selects the provider from `AI_PROVIDER`, `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, and refuses any model that doesn't start with `google/`.
- **OpenRouter provider** (`openrouter.ts`). Calls `/api/v1/chat/completions` with:
  - strict JSON-schema output (`response_format.json_schema`);
  - `provider: { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false, require_parameters: true }`, so only Google's own infrastructure serves requests;
  - low reasoning effort and a per-request timeout.

  It retries 429, 5xx and network errors up to 3 times with backoff, and never retries 402 (out of credits). It treats an `error` object in a 200 response as an error, rejects truncated output, and validates every result with Zod.
- **Profile coach** (`coach.ts`). Rewrites one field at a time. It may only use facts in the student's text and minimal context (role title, tags, career objective). Numbers and proper nouns are checked by `grounding.ts`; if a draft adds unsupported specifics, the coach retries once with a stricter instruction and otherwise refuses. Nothing is saved until the student clicks "Use this version".
- **Pair explanation** (`pair.ts`). Explains the deterministic result in natural language using free-text answers the engine can't read. Names, emails, ids, cohort, photos and account data are never sent. Output is grounding-checked and cached per (viewer, candidate, both profile versions).
- **Voice dictation** (`transcribe.ts`, `src/app/api/ai/transcribe/route.ts`, `src/components/ai/voice-input.tsx`). A microphone button on the free-text profile fields. The browser records with `MediaRecorder` (90 s cap), converts the clip to 16 kHz mono 16-bit WAV with the Web Audio API (OpenRouter's audio input lists wav, ogg, mp3 and similar, not webm or mp4), and uploads it once. The route requires a signed-in student, checks the size (about 3.2 MB) and the file's leading bytes (`src/lib/audio.ts`), consumes the `voice_transcription` quota, and sends the audio to the model as base64 `input_audio` through the same OpenRouter provider and Google-only pinning as every other feature. Model: `OPENROUTER_STT_MODEL` (default `google/gemini-3.7-flash`).
  - The prompt asks for a faithful transcript with light clean-up (fillers dropped, nothing added) and Hindi words in Latin script. Output is `{ text, unclear }`, validated with Zod and capped at about 2,000 characters; an empty transcript becomes a friendly "couldn't make out any words" error.
  - The audio is untrusted: spoken instructions are transcribed, never obeyed. The model has no tools, and the transcript only fills a field the student can edit before saving.
  - Audio is processed in memory and never stored or logged. The first use shows a one-line privacy note, and Settings repeats it. The button is hidden when the browser can't record or AI is unavailable.
  - `Permissions-Policy` allows the microphone for this site only (`microphone=(self)`); camera and location stay blocked.
- **Prompt injection.** Student text is escaped (`<` and `>`) and wrapped in `<student_text>` / `<profile>` tags. The system prompt says such content is data, never instructions. Even a successful injection can only change text that is schema-checked, grounding-checked and shown back to the same viewer.
- **Rate limits.** 30 coach, 40 pair and 40 voice-dictation requests per user per hour, enforced in Postgres (`consume_ai_quota`).
- **No AI, no problem.** Without credentials, `AIStatus` is `missing_credentials`, the UI says AI is unavailable, and sign-in, profiles, discovery, scoring, matching and partnerships all work unchanged.
