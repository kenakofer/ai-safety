# Phase 1 — Candidate papers

Every entry below was checked against the arXiv API (`export.arxiv.org/api/query?id_list=…`) on 2026-10-19.
Title, authors, and date come from that response. **Date = v1 submission date** (first arXiv version).
The relevance lines come from the abstract or from what I already know about the paper. They are not scores yet; stance gets scored in Phase 2.

Legend: ⚠️ = borderline relevance, could cut · 🆕 = 2026 paper I haven't read beyond the abstract

How to prune: delete lines, or mark them `[x]` to keep and `[ ]` to drop. Add your own papers in the same format, with an arXiv ID.

---

## 1. Superposition
> Is polysemanticity in LLM neurons primarily explained by superposition (the model compressing more features than it has dimensions)?

| | Title | Authors | Date | Link | Why relevant |
|---|---|---|---|---|---|
| [ ] | Toy Models of Superposition | Elhage, Hume, Olsson et al. | 2022-09-21 | [2209.10652](https://arxiv.org/abs/2209.10652) | Foundational. Shows superposition causes polysemanticity in toy ReLU models, but tests no LLMs directly. |
| [ ] | Polysemanticity and Capacity in Neural Networks | Scherlis, Sachan, Jermyn et al. | 2022-10-04 | [2210.01892](https://arxiv.org/abs/2210.01892) | Explains polysemanticity through capacity allocation when features outnumber dimensions. A theoretical case for the superposition account. |
| [ ] ⚠️ | Engineering Monosemanticity in Toy Models | Jermyn, Schiefer, Hubinger | 2022-11-16 | [2211.09169](https://arxiv.org/abs/2211.09169) | Toy models where monosemanticity can be induced without losing performance. Suggests polysemanticity isn't always forced by capacity. |
| [ ] | Finding Neurons in a Haystack: Case Studies with Sparse Probing | Gurnee, Nanda, Pauly et al. | 2023-05-02 | [2305.01610](https://arxiv.org/abs/2305.01610) | Empirical LLM evidence (Pythia): early layers spread features across many neurons in superposition, while some middle-layer features are monosemantic. |
| [ ] | Sparse Autoencoders Find Highly Interpretable Features in Language Models | Cunningham, Ewart, Riggs et al. | 2023-09-15 | [2309.08600](https://arxiv.org/abs/2309.08600) | SAEs recover features that are more monosemantic than neurons, which is indirect LLM support for superposition. |
| [ ] | What Causes Polysemanticity? An Alternative Origin Story of Mixed Selectivity from Incidental Causes | Lecomte, Thaman, Schaeffer et al. | 2023-12-05 | [2312.03096](https://arxiv.org/abs/2312.03096) | **Alternative account:** "incidental polysemanticity" appears even when neurons outnumber features. Directly challenges the word "primarily". |
| [ ] | Universal Neurons in GPT2 Language Models | Gurnee, Horsley, Guo et al. | 2024-01-22 | [2401.12181](https://arxiv.org/abs/2401.12181) | Finds a subset of neurons that are universal and interpretable across random seeds. Bears on how much of neuron behavior superposition explains. |
| [ ] | Not All Language Model Features Are One-Dimensionally Linear | Engels, Michaud, Liao et al. | 2024-05-23 | [2405.14860](https://arxiv.org/abs/2405.14860) | Finds multi-dimensional (e.g., circular) features. Complicates the "many 1-D features compressed into fewer dimensions" picture. |
| [ ] ⚠️ | Mathematical Models of Computation in Superposition | Hänni, Mendel, Vaintrob et al. | 2024-08-10 | [2408.05451](https://arxiv.org/abs/2408.05451) | Theory of computing while in superposition. Supports plausibility, but tests no LLMs. |
| [ ] | A is for Absorption: Studying Feature Splitting and Absorption in SAEs | Chanin, Wilken-Smith, Dulka et al. | 2024-09-22 | [2409.14507](https://arxiv.org/abs/2409.14507) | Critique: SAE latents themselves split or absorb features, so SAEs as evidence for superposition are weaker than they look. |
| [ ] | Automated Interpretability Metrics Do Not Distinguish Trained and Random Transformers | Heap, Lawson, Farnik et al. | 2025-01-29 | [2501.17727](https://arxiv.org/abs/2501.17727) | Negative result: SAEs on *random* transformers score about as well, which undercuts SAE-interpretability as evidence of learned superposed features. |
| [ ] | Sparse Autoencoders Do Not Find Canonical Units of Analysis | Leask, Bussmann, Pearce et al. | 2025-02-07 | [2502.04878](https://arxiv.org/abs/2502.04878) | Critique: SAE features depend on dictionary size (stitching, meta-SAEs). Questions the "true underlying features" premise. |
| [ ] ⚠️ | Are Sparse Autoencoders Useful? A Case Study in Sparse Probing | Kantamneni, Engels, Rajamanoharan et al. | 2025-02-23 | [2502.16681](https://arxiv.org/abs/2502.16681) | Negative practical result for SAEs. Only indirectly about the cause of polysemanticity. |
| [ ] | Superposition Yields Robust Neural Scaling | Liu, Liu, Gore | 2025-05-15 | [2505.10465](https://arxiv.org/abs/2505.10465) | Links strong superposition to LLM scaling laws and checks this against open LLMs. Supports the claim that LLMs operate in strong superposition. |
| [ ] 🆕 | Polysemanticity or Polysemy? Lexical Identity Confounds Superposition Metrics | Ait Hou, Hwa | 2026-04-01 | [2604.00443](https://arxiv.org/abs/2604.00443) | Critique, 110M–70B models: much of the measured neuron overlap comes from shared word form ("bank"), not superposition. |

## 2. CoT monitorability
> Do frontier models' chains of thought reliably reveal the factors that actually drive their answers, enough to support CoT monitoring?

| | Title | Authors | Date | Link | Why relevant |
|---|---|---|---|---|---|
| [ ] | Language Models Don't Always Say What They Think: Unfaithful Explanations in CoT Prompting | Turpin, Michael, Perez et al. | 2023-05-07 | [2305.04388](https://arxiv.org/abs/2305.04388) | Classic negative result: biasing features (e.g., "answer is always A") change answers but go unmentioned in the CoT. |
| [ ] | Measuring Faithfulness in Chain-of-Thought Reasoning | Lanham, Chen, Radhakrishnan et al. | 2023-07-17 | [2307.13702](https://arxiv.org/abs/2307.13702) | CoT-truncation and corruption interventions. Faithfulness varies by task and *decreases* with model size. |
| [ ] ⚠️ | Let's Think Dot by Dot: Hidden Computation in Transformer LMs | Pfau, Merrill, Bowman | 2024-04-24 | [2404.15758](https://arxiv.org/abs/2404.15758) | Filler tokens can carry hidden computation. Shows CoT text needn't reflect the computation. Small models only. |
| [ ] | Are DeepSeek R1 And Other Reasoning Models More Faithful? | Chua, Evans | 2025-01-14 | [2501.08156](https://arxiv.org/abs/2501.08156) | Reasoning models verbalize cues more often than non-reasoning models. Mixed to positive. |
| [ ] | Chain-of-Thought Reasoning In The Wild Is Not Always Faithful | Arcuschin, Janiak, Krzyzanowski et al. | 2025-03-11 | [2503.08679](https://arxiv.org/abs/2503.08679) | Unfaithfulness on natural prompts with no artificial bias (post-hoc rationalization, illogical shortcuts), across frontier models. |
| [ ] | Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation | Baker, Huizinga, Gao et al. | 2025-03-14 | [2503.11926](https://arxiv.org/abs/2503.11926) | OpenAI: a CoT monitor catches reward hacking well (positive), but optimizing against it produces obfuscation (fragility). |
| [ ] | Reasoning Models Don't Always Say What They Think | Chen, Benton, Radhakrishnan et al. | 2025-05-08 | [2505.05410](https://arxiv.org/abs/2505.05410) | Claude 3.7 Sonnet and R1 verbalize hints they use only a minority of the time. A central negative result. |
| [ ] | CoT Red-Handed: Stress Testing Chain-of-Thought Monitoring | Arnav, Bernabeu-Pérez, Helm-Burger et al. | 2025-05-29 | [2505.23575](https://arxiv.org/abs/2505.23575) | CoT monitoring beats action-only monitoring on subtle sabotage but can be misled. Mixed. |
| [ ] | When Chain of Thought is Necessary, Language Models Struggle to Evade Monitors | Emmons, Jenner, Elson et al. | 2025-07-07 | [2507.05246](https://arxiv.org/abs/2507.05246) | Positive counterpoint: when the task *requires* CoT, models struggle to hide the reasoning from monitors. |
| [ ] | Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety | Korbak, Balesni, Barnes et al. | 2025-07-15 | [2507.11473](https://arxiv.org/abs/2507.11473) | Multi-lab position paper: CoT monitoring is useful now but fragile. Conceptual, not new evidence. |
| [ ] | Output Supervision Can Obfuscate the Chain of Thought | Drori, Marks, Woodworth et al. | 2025-10-11 | [2511.11584](https://arxiv.org/abs/2511.11584) | Even training only on *outputs* can obfuscate CoT. Undermines one proposed safeguard. |
| [ ] | Can Reasoning Models Obfuscate Reasoning? Stress-Testing CoT Monitorability | Zolkowski, Xing, Lindner et al. | 2025-10-21 | [2510.19851](https://arxiv.org/abs/2510.19851) | Prompted obfuscation stress test. Compares internal reasoning traces with external CoT. |
| [ ] ⚠️ | A Pragmatic Way to Measure Chain-of-Thought Monitorability | Emmons, Zimmermann, Elson et al. | 2025-10-28 | [2510.23966](https://arxiv.org/abs/2510.23966) | Proposes legibility and coverage metrics. Mostly methodology, though it may include measurements. |
| [ ] ⚠️ | Investigating CoT Monitorability in Large Reasoning Models | Yang, Wu, Gong et al. | 2025-11-11 | [2511.08525](https://arxiv.org/abs/2511.08525) | Systematic study of unfaithfulness plus monitor miscalibration on long traces. |
| [ ] 🆕 | Chain-of-thought obfuscation learned from output supervision can generalise to unseen tasks | Mitrani Hadida, Bhanji, Tice et al. | 2026-01-30 | [2601.23086](https://arxiv.org/abs/2601.23086) | Obfuscation learned during reward hacking transfers to new tasks. Negative for robustness. |
| [ ] 🆕 ⚠️ | Noticing the Watcher: LLM Agents Can Infer CoT Monitoring from Blocking Feedback | Jiralerspong, Kondrup, Bengio | 2026-03-14 | [2603.16928](https://arxiv.org/abs/2603.16928) | Agents infer that they're being monitored without being told. A threat to monitorability. |
| [ ] 🆕 | MonitorBench: A Comprehensive Benchmark for CoT Monitorability in LLMs | Wang, Sun, Ko et al. | 2026-03-30 | [2603.28590](https://arxiv.org/abs/2603.28590) | 1,514 instances across 19 tasks with designed decision-critical factors. Directly measures the question's construct. |

## 3. Alignment faking
> Do frontier LLMs robustly fake alignment (behave differently when they believe they're being trained vs. unmonitored) across models and setups?

| | Title | Authors | Date | Link | Why relevant |
|---|---|---|---|---|---|
| [ ] ⚠️ | Sleeper Agents: Training Deceptive LLMs that Persist Through Safety Training | Hubinger, Denison, Mu et al. | 2024-01-10 | [2401.05566](https://arxiv.org/abs/2401.05566) | Deception is *trained in* deliberately, not emergent. Context for persistence, but likely 0 stance on this question. |
| [ ] ⚠️ | Poser: Unmasking Alignment Faking LLMs by Manipulating Their Internals | Clymer, Juang, Field | 2024-05-08 | [2405.05466](https://arxiv.org/abs/2405.05466) | Detection benchmark using fine-tuned faker models. About detection, not prevalence. |
| [ ] | Frontier Models are Capable of In-context Scheming | Meinke, Schoen, Scheurer et al. | 2024-12-06 | [2412.04984](https://arxiv.org/abs/2412.04984) | Apollo: several frontier models scheme in context, including some oversight-conditional behavior. Adjacent evidence. |
| [ ] | Alignment faking in large language models | Greenblatt, Denison, Wright et al. | 2024-12-18 | [2412.14093](https://arxiv.org/abs/2412.14093) | The original: a compliance gap between training and unmonitored conditions in Claude 3 Opus / 3.5 Sonnet, with explicit AF reasoning. |
| [ ] | Large Language Models Often Know When They Are Being Evaluated | Needham, Edkins, Pimpale et al. | 2025-05-28 | [2505.23836](https://arxiv.org/abs/2505.23836) | Evaluation awareness is a prerequisite for condition-dependent behavior. Indirect. |
| [ ] | Empirical Evidence for Alignment Faking in a Small LLM and Prompt-Based Mitigation Techniques | Koorndijk | 2025-06-17 | [2506.21584](https://arxiv.org/abs/2506.21584) | Claims AF in LLaMA 3 8B, which simple prompting suppresses ("shallow deception"). Bears on "robustly". |
| [ ] | Why Do Some Language Models Fake Alignment While Others Don't? | Sheshadri, Hughes, Michael et al. | 2025-06-22 | [2506.18032](https://arxiv.org/abs/2506.18032) | **Key replication:** of 25 models, only ~5 show a compliance gap. Directly tests "across models". |
| [ ] | Stress Testing Deliberative Alignment for Anti-Scheming Training | Schoen, Nitishinskaya, Balesni et al. | 2025-09-19 | [2509.15541](https://arxiv.org/abs/2509.15541) | OpenAI/Apollo: covert actions in o3/o4-mini, and evaluation awareness confounds the measurements. |
| [ ] 🆕 | Value-Conflict Diagnostics Reveal Widespread Alignment Faking in Language Models | Nair, Ruan, Wang | 2026-04-22 | [2604.20995](https://arxiv.org/abs/2604.20995) | Argues earlier setups under-detect AF because models refuse outright. New diagnostic (VLAF) finds AF to be "widespread". |
| [ ] 🆕 | Tatemae: Detecting Alignment Faking via Tool Selection in LLMs | Leonesi, Belardinelli, Corradini et al. | 2026-04-29 | [2604.26511](https://arxiv.org/abs/2604.26511) | New agentic/tool-use setup (108 IT scenarios). Tests whether AF generalizes beyond chat setups. |
| [ ] 🆕 | Behavioural Analysis of Alignment Faking | Mitrani Hadida, Karty, Williams-King et al. | 2026-05-26 | [2605.27681](https://arxiv.org/abs/2605.27681) | Finds AF in more models than previously reported, including small ones. Splits it into values, goal-guarding, and sycophancy drivers. |
| [ ] 🆕 | The Refusal Residue: When Probes Catch Alignment Faking and When They Don't | Mehta | 2026-07-15 | [2607.13346](https://arxiv.org/abs/2607.13346) | A 13-model open-weight sweep finds natural faking in only 2 (Qwen3-32B, Llama-3.1-8B). Negative on "across models". Single author. |

---

## Not included (no arXiv ID / not fetched). Tell me if you want any of these
- **Towards Monosemanticity** (Anthropic, 2023, transformer-circuits.pub). Central SAE evidence for superposition, but it's on Transformer Circuits, not arXiv.
- **Alignment Faking Revisited: Improved Classifiers and Open Source Extensions** (Hughes & Sheshadri, Anthropic Alignment Science blog, 2025). With a better classifier, most open models don't AF in the prompted setting. Blog only.
- **ChameleonBench: Quantifying Alignment Faking in LLMs** (PMLR v304, 2026). I found it in search but didn't find an arXiv ID.
- OpenAI monitorability evals release (alignment.openai.com, 2026). Blog plus datasets.

If you want non-arXiv sources, the schema's `id` field will need a slug, e.g. `web:towards-monosemanticity`.
