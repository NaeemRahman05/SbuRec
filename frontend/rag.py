import os
from pathlib import Path
from glob import glob
import re
import sys
from typing import Any, Dict, List, Optional
from statistics import mean
import pandas as pd
import chromadb
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
    parts_dir = DEFAULT_RAG_PARTS_DIR
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

raw_client = chromadb.PersistentClient(path=PERSIST_DIR)
raw_collection = raw_client.get_or_create_collection(COLLECTION_NAME)
existing_count = raw_collection.count()
print(f"Using existing Chroma collection with {existing_count} entries")

embeddings = OpenAIEmbeddings(api_key=OPENAI_API_KEY, model=EMBED_MODEL_NAME)
vectorstore = Chroma(
    collection_name=COLLECTION_NAME,
    persist_directory=PERSIST_DIR,
    embedding_function=embeddings,
)

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

llm = ChatOpenAI(api_key=OPENAI_API_KEY, model=CHAT_MODEL_NAME, temperature=0)

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
    out = (INTENT_PROMPT | llm | intent_parser).invoke({"question": question}).strip().upper()
    return out

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
    if sbc:
        retriever = vectorstore.as_retriever(search_kwargs={"k": k, "filter": {"SBC": sbc}})
    else:
        retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    return retriever.invoke(question)

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
    return (REC_PROMPT | llm | rec_parser).invoke({"question": question, "evidence": evidence})

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
    return (REC_PROMPT | llm | rec_parser).invoke({"question": question, "evidence": evidence})

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
    return (REC_PROMPT | llm | rec_parser).invoke({"question": question, "evidence": evidence})

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
    return (COMPARE_PROMPT | llm | compare_parser).invoke(
        {"question": question, "evidence": evidence, "professor_context": prof_ctx}
    )

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
    print("SBU RAG Advisor — CLI")
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
