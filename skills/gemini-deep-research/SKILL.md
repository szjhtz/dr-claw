---
name: gemini-deep-research
description: |
  Perform complex, long-running research tasks using Gemini Deep Research Agent.
  Use when: asked to research topics requiring multi-source synthesis, competitive analysis,
  market research, literature review, or comprehensive technical investigations that benefit
  from systematic web search and analysis. Invokes Google's deep-research agent to autonomously
  search the web, gather evidence, and produce a structured markdown report.
license: MIT
metadata:
  author: clawdbot
  version: "1.0.0"
  requires:
    env:
      - GEMINI_API_KEY
---

# Gemini Deep Research

Use Google Gemini's Deep Research Agent to perform complex, long-running context gathering and synthesis tasks. The agent autonomously breaks down your query, searches the web, and synthesizes findings into a comprehensive report.

## Prerequisites

- `GEMINI_API_KEY` environment variable (obtain from [Google AI Studio](https://aistudio.google.com/apikey))
- Python 3.8+ with `requests` library
- **Note**: Requires a direct Gemini API key — OAuth tokens are not supported.

## When to Use

- Comprehensive literature or market research
- Competitive landscape analysis
- Technical deep dives requiring multi-source synthesis
- Any research task that benefits from systematic web search
- When you need a structured report with evidence from multiple sources

## How It Works

The Deep Research agent:
1. Breaks down complex queries into sub-questions
2. Searches the web systematically for each sub-question
3. Synthesizes findings into a comprehensive markdown report
4. Provides streaming progress updates during execution

## Usage

### Basic Research

```bash
scripts/deep_research.py --query "Research the current state of quantum error correction" --stream
```

### Custom Output Format

```bash
scripts/deep_research.py --query "Competitive landscape of EV batteries" \
  --format "1. Executive Summary\n2. Key Players (data table)\n3. Technology Comparison\n4. Supply Chain Risks"
```

### With File Search (optional)

```bash
scripts/deep_research.py --query "Compare our fiscal year report against current public web news" \
  --file-search-store "fileSearchStores/my-store-name"
```

### Specify Output Directory

```bash
scripts/deep_research.py --query "Your research topic" --output-dir ./reports --stream
```

## Output

Results are saved as timestamped files in the output directory:
- `deep-research-YYYY-MM-DD-HH-MM-SS.md` — Final report in markdown
- `deep-research-YYYY-MM-DD-HH-MM-SS.json` — Full interaction metadata

The report is also printed to stdout for immediate use.

## API Details

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/interactions`
- **Agent model**: `deep-research-pro-preview-12-2025`
- **Auth**: `x-goog-api-key` header

## Limitations

- Long-running tasks (minutes to tens of minutes depending on complexity)
- May incur API costs depending on your Google AI quota
- Results depend on web content available at query time
