import os
from pathlib import Path
from glob import glob
import re
import sys
from typing import Any, Dict, List, Optional, Tuple
from statistics import mean
import pandas as pd
import chromadb
import argparse
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document

# Data layout: prefer parts under `frontend/public/rag_parts/` created by scripts/split_rag_data.py
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DEFAULT_RAG_SRC = PUBLIC_DIR / "rag_data.csv"
DEFAULT_RAG_PARTS_DIR = PUBLIC_DIR / "rag_parts"

PERSIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sbu_chroma_db")
COLLECTION_NAME = "stonybrook_courses"

# Try to load a .env file in the `backend/` folder so env vars (like OPENAI_API_KEY)
# are available when running the script from the repo root or elsewhere.
env_path = Path(__file__).resolve().parent / ".env"
try:
    # Preferred: python-dotenv
    from dotenv import load_dotenv
    load_dotenv(env_path)
except Exception:
    # Fallback: simple manual parse if .env exists
    if env_path.exists():
        try:
            for ln in env_path.read_text(encoding="utf-8").splitlines():
                s = ln.strip()
                if not s or s.startswith("#"):
                    continue
                if "=" in s:
                    k, v = s.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    # don't overwrite existing env vars
                    os.environ.setdefault(k, v)
        except Exception:
            pass

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

CHAT_MODEL_NAME  = "gpt-4o-mini"
EMBED_MODEL_NAME = "text-embedding-3-small"

K_RETRIEVE = 12   
TOP_SHOW   = 3    

SBC_CODES = {"TECH", "SBS+", "HUM", "CER", "GLO", "HFA+", "LANG", "QPS", "SNW", "STAS", "USA"}

REQ_COLS = [
    "Course Code","Course Prefix","Course Number","Course Section","Season","Year",
    "Course Name","Instructor","Total Students","Grade A","Grade A-","Grade B+",
    "Grade B","Grade B-","Grade C+","Grade C","Grade C-","Grade D","Grade F",
    "Overall Mean","Overall StdDev","Overall Responses","StudyHours Mean",
    "StudyHours StdDev","StudyHours Responses","Credits","SBC","Prerequisites",
    "Advisory","Total_Grades","A_Probability"
]

if not OPENAI_API_KEY or OPENAI_API_KEY.strip() == "" or "YOUR_OPENAI_KEY_HERE" in OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY not set. Set env var or paste into script.")


def find_rag_files() -> list[str]:
    # prefer parts directory
    # check strict parts dir first (if present), then default parts dir
    parts_dir_strict = PUBLIC_DIR / "rag_parts_strict"
    parts_dir = parts_dir_strict if parts_dir_strict.exists() else DEFAULT_RAG_PARTS_DIR
    if parts_dir.exists():
        parts = sorted([str(p) for p in parts_dir.glob("rag_data_part*.csv")])
        if parts:
            return parts
    # fallback to single file
    if DEFAULT_RAG_SRC.exists():
        return [str(DEFAULT_RAG_SRC)]
    # try any rag_data*.csv under public
    any_parts = sorted([str(p) for p in PUBLIC_DIR.glob("rag_data*.csv")])
    return any_parts


rag_files = find_rag_files()
if not rag_files:
    raise FileNotFoundError(
        "No rag data files found. Put `rag_data.csv` in frontend/public or run scripts/split_rag_data.py to create parts under frontend/public/rag_parts/"
    )

print(f"Loading RAG files: {rag_files}")
df_list = []
for p in rag_files:
    try:
        df_list.append(pd.read_csv(p, low_memory=False))
    except Exception as e:
        print(f"Failed to read {p}: {e}")
if not df_list:
    raise ValueError("No CSVs could be read for RAG data")
df = pd.concat(df_list, ignore_index=True)
for c in REQ_COLS:
    if c not in df.columns:
        df[c] = ""
print(f"Loaded {len(df)} rows from rag files")

# Determine run mode: 'sbc' (default) uses vectorstore + SBC filters, 'lenient' uses cleaned classie CSVs
MODE = os.environ.get("RAG_MODE", "sbc").lower()

# --- LENIENT (classie-based) dataset loader ---
CLASSIE_CLEANED_DIR = PUBLIC_DIR / "cleaned"

def find_classie_cleaned_files() -> list[Path]:
    if not CLASSIE_CLEANED_DIR.exists():
        return []
    return sorted(CLASSIE_CLEANED_DIR.glob("*.csv"))

def load_classie_df() -> pd.DataFrame:
    files = find_classie_cleaned_files()
    if not files:
        return pd.DataFrame()
    dfs = []
    for f in files:
        try:
            dfs.append(pd.read_csv(f, low_memory=False))
        except Exception as e:
            print(f"Failed to read classie cleaned file {f}: {e}")
    if not dfs:
        return pd.DataFrame()
    cdf = pd.concat(dfs, ignore_index=True)
    return cdf

# Load classie cleaned dataset once (used by lenient retriever)
CLASSIE_DF = load_classie_df()
if CLASSIE_DF is not None and not CLASSIE_DF.empty:
    print(f"Loaded classie cleaned dataset with {len(CLASSIE_DF)} rows")
else:
    print("No classie cleaned CSVs found under frontend/public/cleaned/")

def ensure_vectorstore_initialized() -> None:
    """Lazily initialize OpenAI embeddings and Chroma vectorstore when MODE=='sbc'."""
    global embeddings, vectorstore
    if vectorstore is not None:
        return
    if MODE != "sbc":
        return
    try:
        embeddings = OpenAIEmbeddings(api_key=OPENAI_API_KEY, model=EMBED_MODEL_NAME)
        vectorstore = Chroma(
            collection_name=COLLECTION_NAME,
            persist_directory=PERSIST_DIR,
            embedding_function=embeddings,
        )
        print("Initialized OpenAI embeddings and Chroma vectorstore for SBC mode")
    except Exception as e:
        print(f"Warning: could not initialize OpenAI/Chroma: {e}")
        embeddings = None
        vectorstore = None

raw_client = chromadb.PersistentClient(path=PERSIST_DIR)
raw_collection = raw_client.get_or_create_collection(COLLECTION_NAME)
existing_count = raw_collection.count()
print(f"Using existing Chroma collection with {existing_count} entries")
# Delay creating OpenAI embeddings and Chroma vectorstore until we know the MODE.
embeddings = None
vectorstore = None

def normalize_sbc_in_question(q: str) -> Optional[str]:
    """Return canonical SBC code if present in user question (TECH/QPS/HFA+/...)."""
    uq = q.upper()
    for code in SBC_CODES:
        if code in uq:
            return code
    return None

def extract_dislikes(q: str) -> List[str]:
    """Parse dislikes like don't like/ not into / dislike / avoid / no <topic>."""
    dislikes = []
    pats = [
        r"don['’]t like ([A-Za-z &/-]+)",
        r"not into ([A-Za-z &/-]+)",
        r"dislike ([A-Za-z &/-]+)",
        r"avoid ([A-Za-z &/-]+)",
        r"no\s+([A-Za-z &/-]+)"
    ]
    for pat in pats:
        for m in re.findall(pat, q, flags=re.IGNORECASE):
            dislikes.append(m.strip().lower())
    return dislikes

def extract_professor(q: str) -> Optional[str]:
    m = re.search(r"(?:professor|prof|with)\s+([A-Z][A-Za-z\-'.]+(?:\s+[A-Z][A-Za-z\-'.]+)?)", q, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None

def extract_course_codes(q: str) -> List[str]:
    m = re.findall(r"\b([A-Z]{2,4})\s*([0-9]{3})\b", q, re.IGNORECASE)
    return ["{}{}".format(p.upper(), n) for (p, n) in m]

def docs_to_meta(docs: List[Document]) -> List[Dict[str, Any]]:
    return [d.metadata for d in docs]

def course_number_int(meta: Dict[str, Any]) -> int:
    raw = meta.get("Course Number", "")
    try:
        return int(float(raw))
    except Exception:
        return 0

def filter_out_dislikes(metas: List[Dict[str, Any]], dislikes: List[str]) -> List[Dict[str, Any]]:
    if not dislikes:
        return metas
    out = []
    for m in metas:
        name = str(m.get("Course Name", "")).lower()
        prefix = str(m.get("Course Prefix", "")).lower()
        keep = True
        for d in dislikes:
            if d and (d in name or d in prefix):
                keep = False
                break
        if keep:
            out.append(m)
    return out

def dedupe_sort_cap(metas: List[Dict[str, Any]], top: int = TOP_SHOW) -> List[Dict[str, Any]]:
    """Sort by A_Probability desc, dedupe by Course Code, drop Course Number > 450."""
    def a_prob(m):
        try:
            return float(m.get("A_Probability", 0) or 0)
        except Exception:
            return 0.0
    sorted_rows = sorted(metas, key=a_prob, reverse=True)
    seen = set()
    out = []
    for m in sorted_rows:
        code = m.get("Course Code", "")
        if course_number_int(m) > 450:
            continue
        if code and code not in seen:
            seen.add(code)
            out.append(m)
        if len(out) >= top:
            break
    return out

def build_evidence_block(metas: List[Dict[str, Any]]) -> str:
    parts = []
    for m in metas:
        parts.append(
            "Course Code: {code}\n"
            "Course Name: {name}\n"
            "Instructor: {inst}\n"
            "Credits: {cr}\n"
            "SBC: {sbc}\n"
            "Prerequisites: {pre}\n"
            "Advisory: {adv}\n"
            "A_Probability: {ap}\n"
            "StudyHours Mean: {sh}\n"
            "Total Students: {ts}\n"
            "----".format(
                code=m.get("Course Code",""),
                name=m.get("Course Name",""),
                inst=m.get("Instructor",""),
                cr=m.get("Credits",""),
                sbc=m.get("SBC",""),
                pre=m.get("Prerequisites",""),
                adv=m.get("Advisory",""),
                ap=m.get("A_Probability",""),
                sh=m.get("StudyHours Mean",""),
                ts=m.get("Total Students",""),
            )
        )
    return "\n".join(parts)


def format_brief(meta: Dict[str, Any]) -> str:
    """Format a single meta record into a short one-line string for non-LLM fallback."""
    code = meta.get("Course Code", "").strip()
    name = meta.get("Course Name", "").strip()
    inst = meta.get("Instructor", "").strip()
    cr = meta.get("Credits", "")
    sbc = meta.get("SBC", "")
    pre = meta.get("Prerequisites", "")
    ap = meta.get("A_Probability", "")
    sh = meta.get("StudyHours Mean", "")
    return f"{code} — {name} ({inst}; Credits {cr}; SBC {sbc}; Prereq: {pre}; A≈{ap}; Study≈{sh})"

try:
    if OPENAI_API_KEY and OPENAI_API_KEY.strip() and "YOUR_OPENAI_KEY_HERE" not in OPENAI_API_KEY:
        llm = ChatOpenAI(api_key=OPENAI_API_KEY, model=CHAT_MODEL_NAME, temperature=0)
    else:
        llm = None
        print("No OPENAI_API_KEY: LLM-based intent classification and final text generation will be disabled.")
except Exception as e:
    llm = None
    print(f"Failed to initialize ChatOpenAI LLM: {e}")

INTENT_PROMPT = PromptTemplate.from_template(
    """You are an SBU course advisor intent classifier.
User: {question}

Classify into exactly one of:
- ELECTIVE_RECOMMENDATION
- EASY_A
- COURSE_COMPARISON
- INTEREST_BASED
Return only the label."""
)
intent_parser = StrOutputParser()

def classify_intent(question: str) -> str:
    ql = question.lower()
    if any(tok in ql for tok in [" vs ", "versus", "compare", "which should i take", "should i do"]):
        return "COURSE_COMPARISON"
    # If LLM is available, use it for intent classification; otherwise fallback to simple heuristic
    if llm is not None:
        out = (INTENT_PROMPT | llm | intent_parser).invoke({"question": question}).strip().upper()
        return out
    # fallback: if question mentions SBC-like tokens prefer elective, otherwise interest-based
    return "ELECTIVE_RECOMMENDATION" if normalize_sbc_in_question(question) else "INTEREST_BASED"

REC_PROMPT = PromptTemplate.from_template(
    """You are a Stony Brook University course advisor.

User question:
{question}

Use ONLY the evidence below (do not invent facts). Weigh A_Probability and StudyHours Mean. If the user mentioned dislikes, assume those were already filtered out.

Evidence:
{evidence}

Write 2–3 natural sentences explaining why these fit. Then, in one flowing sentence, mention the top 3 like:
CourseCode — Course Name (Instructor; Credits cr; SBC; Prereq: ...; Advisory: ...; A≈A_Probability; Study≈StudyHours Mean).
End with one short closing sentence."""
)
rec_parser = StrOutputParser()

COMPARE_PROMPT = PromptTemplate.from_template(
    """You are a Stony Brook University course advisor.

User question:
{question}

Professor context (use if present):
{professor_context}

Use ONLY the evidence below.

Evidence:
{evidence}

Write 2–3 natural sentences comparing A_Probability and StudyHours Mean, and factor any professor context if present.
End with: WINNER=<CourseCode> — reason."""
)
compare_parser = StrOutputParser()

def retrieve_candidates(question: str, sbc: Optional[str], k: int) -> List[Document]:
    """
    Retrieve via vector search; if sbc present, use metadata filter in retriever.
    Apply CourseNumber <= 450 later (client-side) to avoid Chroma filter operator issues.
    """
    # dispatch by selected MODE
    if MODE == "sbc":
        # try to lazily initialize embeddings/vectorstore based on current MODE
        ensure_vectorstore_initialized()
        if vectorstore is None:
            print("Warning: vectorstore not available after initialization attempt; falling back to lenient retrieval")
            return retrieve_candidates_lenient(question, k)
        if sbc:
            retriever = vectorstore.as_retriever(search_kwargs={"k": k, "filter": {"SBC": sbc}})
        else:
            retriever = vectorstore.as_retriever(search_kwargs={"k": k})
        return retriever.invoke(question)
    else:
        return retrieve_candidates_lenient(question, k)


def retrieve_candidates_lenient(question: str, k: int) -> List[Document]:
    """Keyword-based, lenient retriever using the cleaned classie CSVs.

    This avoids needing a separate vector DB for the lenient mode and supports
    queries like professor avoidance and prerequisite checks by searching
    comments, prerequisites, course name, and instructor fields.
    """
    if CLASSIE_DF is None or CLASSIE_DF.empty:
        return []
    q = question.lower()
    tokens = [t for t in re.findall(r"[A-Za-z0-9]+", q) if len(t) > 2]

    scored: List[Tuple[float, Any]] = []
    for _, row in CLASSIE_DF.iterrows():
        comments = str(row.get("Valuable Comments", "") or "") + " " + str(row.get("Improvement Comments", "") or "")
        text = " ".join([
            str(row.get("Course Code", "") or ""),
            str(row.get("Course Name", "") or ""),
            str(row.get("Instructor", "") or ""),
            str(row.get("Prerequisites", "") or ""),
            comments,
        ]).lower()
        score = 0.0
        for t in tokens:
            if t in text:
                score += 1.0

        # small boosts from numeric metadata when available
        try:
            aprob = float(row.get("A_Probability", 0) or 0)
        except Exception:
            aprob = 0.0
        try:
            study = float(row.get("StudyHours Mean", 0) or 0)
        except Exception:
            study = 0.0
        score += aprob * 0.05
        if study > 0:
            score += max(0, (5.0 - study) * 0.02)

        if score > 0:
            scored.append((score, row))

    scored.sort(key=lambda x: x[0], reverse=True)
    docs: List[Document] = []
    for score, row in scored[:k]:
        # row is a pandas Series; convert to dict for metadata
        rdict = row.to_dict() if hasattr(row, "to_dict") else dict(row)
        content = (str(rdict.get("Valuable Comments", "")) + "\n" + str(rdict.get("Improvement Comments", ""))).strip()
        metadata = {c: rdict.get(c, "") for c in rdict.keys()}
        metadata["score"] = score
        docs.append(Document(page_content=content or str(row.get("Course Name", "")), metadata=metadata))
    return docs

def professor_stats_for_code(code: str, professor: str) -> Optional[str]:
    res = raw_collection.get(where={"$and": [{"Course Code": code}, {"Instructor": professor}]})
    mets = res.get("metadatas", [])
    if isinstance(mets, list) and mets and isinstance(mets[0], list):
        mets = mets[0]
    if not mets:
        return None
    a_probs, hours = [], []
    for m in mets:
        try:
            a_probs.append(float(m.get("A_Probability", 0)))
        except Exception:
            pass
        try:
            hours.append(float(m.get("StudyHours Mean", 0)))
        except Exception:
            pass
    if not a_probs and not hours:
        return None
    parts = []
    if a_probs:
        parts.append(f"A_Prob_avg={round(mean(a_probs), 3)}")
    if hours:
        parts.append(f"StudyHours_avg={round(mean(hours), 2)}")
    parts.append(f"n={len(mets)}")
    return f"{code} with {professor}: " + ", ".join(parts)

def handle_elective(question: str) -> str:
    sbc = normalize_sbc_in_question(question)
    if not sbc:
        sbc = input("Which SBC code are you targeting (e.g., TECH, QPS, HUM, HFA+, ARTS)? ").strip().upper()
        if sbc not in SBC_CODES:
            return "Unrecognized SBC code."
    dislikes = extract_dislikes(question)
    docs = retrieve_candidates(question, sbc, K_RETRIEVE)
    metas = filter_out_dislikes(docs_to_meta(docs), dislikes)
    metas = [m for m in metas if (m.get("SBC", "") == sbc)]
    metas = [m for m in metas if course_number_int(m) <= 450]
    metas = dedupe_sort_cap(metas, top=TOP_SHOW)
    if not metas:
        return f"No courses found for SBC {sbc}."
    evidence = build_evidence_block(metas)
    if llm is not None:
        return (REC_PROMPT | llm | rec_parser).invoke({"question": question, "evidence": evidence})
    # Fallback: simple formatted list when LLM is not available
    return "\n".join(format_brief(m) for m in metas) + "\n\n(LLM not available; showing basic matches)"

def handle_easy_a(question: str) -> str:
    sbc = normalize_sbc_in_question(question)
    dislikes = extract_dislikes(question)
    docs = retrieve_candidates(question, sbc, K_RETRIEVE)
    metas = filter_out_dislikes(docs_to_meta(docs), dislikes)
    if sbc:
        metas = [m for m in metas if (m.get("SBC", "") == sbc)]
    metas = [m for m in metas if course_number_int(m) <= 450]
    metas = dedupe_sort_cap(metas, top=TOP_SHOW)
    if not metas:
        return "No courses found."
    evidence = build_evidence_block(metas)
    if llm is not None:
        return (REC_PROMPT | llm | rec_parser).invoke({"question": question, "evidence": evidence})
    return "\n".join(format_brief(m) for m in metas) + "\n\n(LLM not available; showing basic matches)"

def handle_interest(question: str) -> str:
    sbc = normalize_sbc_in_question(question) 
    dislikes = extract_dislikes(question)
    docs = retrieve_candidates(question, sbc, K_RETRIEVE)
    metas = filter_out_dislikes(docs_to_meta(docs), dislikes)
    if sbc:
        metas = [m for m in metas if (m.get("SBC", "") == sbc)]
    metas = [m for m in metas if course_number_int(m) <= 450]
    metas = dedupe_sort_cap(metas, top=TOP_SHOW)
    if not metas:
        return "No courses matched your interests."
    evidence = build_evidence_block(metas)
    if llm is not None:
        return (REC_PROMPT | llm | rec_parser).invoke({"question": question, "evidence": evidence})
    return "\n".join(format_brief(m) for m in metas) + "\n\n(LLM not available; showing basic matches)"

def handle_compare(question: str) -> str:
    codes = extract_course_codes(question)
    if len(codes) < 2:
        return "Provide two course codes to compare (e.g., CSE214 vs AMS161)."
    prof = extract_professor(question)
    if not prof:
        prof_in = input(f"Which professor should I consider for {codes[0]} / {codes[1]}? Enter 'none' to skip: ").strip()
        if prof_in.lower() != "none":
            prof = prof_in

    metas: List[Dict[str, Any]] = []
    for code in codes[:2]:
        res = raw_collection.get(where={"Course Code": code})
        mm = res.get("metadatas", [])
        if isinstance(mm, list) and mm and isinstance(mm[0], list):
            mm = mm[0]
        if not mm:
            continue
        mm = [m for m in mm if course_number_int(m) <= 450]
        if not mm:
            continue
        best = dedupe_sort_cap(mm, top=1)
        metas.extend(best)

    if not metas:
        return "Could not find metadata for those courses."

    prof_ctx_lines = []
    if prof:
        for code in {m.get("Course Code","") for m in metas if m.get("Course Code")}:
            s = professor_stats_for_code(code, prof)
            if s:
                prof_ctx_lines.append(s)
    prof_ctx = "\n".join(prof_ctx_lines) if prof_ctx_lines else ""

    evidence = build_evidence_block(metas)
    if llm is not None:
        return (COMPARE_PROMPT | llm | compare_parser).invoke(
            {"question": question, "evidence": evidence, "professor_context": prof_ctx}
        )
    # Simple fallback compare: pick the course with higher A_Probability (then lower study hours)
    def score_meta(m: Dict[str, Any]) -> float:
        try:
            ap = float(m.get("A_Probability", 0) or 0)
        except Exception:
            ap = 0.0
        try:
            sh = float(m.get("StudyHours Mean", 0) or 0)
        except Exception:
            sh = 0.0
        return ap - (sh * 0.01)

    scored = [(score_meta(m), m) for m in metas]
    scored.sort(key=lambda x: x[0], reverse=True)
    winner = scored[0][1]
    return f"Winner={winner.get('Course Code','')}: {format_brief(winner)}\n(LLM not available; basic comparison)"

def route_and_answer(question: str) -> str:
    intent = classify_intent(question)
    if intent == "COURSE_COMPARISON":
        return handle_compare(question)
    if intent == "EASY_A":
        return handle_easy_a(question)
    if intent == "ELECTIVE_RECOMMENDATION":
        return handle_elective(question)
    if intent == "INTEREST_BASED":
        return handle_interest(question)
    return handle_elective(question) if normalize_sbc_in_question(question) else handle_interest(question)

def chat_with_rag(question: str) -> str:
    return route_and_answer(question)

def main():
    global MODE
    p = argparse.ArgumentParser(description="SBU RAG Advisor CLI")
    p.add_argument("--mode", choices=["sbc", "lenient"], default=MODE, help="Which retrieval mode to use: 'sbc' (vector SBC mode) or 'lenient' (classie cleaned comments)")
    args, unknown = p.parse_known_args()
    MODE = args.mode
    print(f"SBU RAG Advisor — CLI (mode={MODE})")
    print("Type 'exit' to quit.")
    while True:
        q = input("\nYou: ").strip()
        if q.lower() in ("exit", "quit"):
            break
        print("\nThinking...\n")
        try:
            ans = route_and_answer(q)
            print(ans)
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
