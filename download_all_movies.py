import pandas as pd
import json
import ast
import re
import os

print("--- DOWNLOADING AND PROCESSING ALL 4,800+ TMDB MOVIES ---")

MOVIES_URL = "https://raw.githubusercontent.com/erkansirin78/datasets/master/tmdb_5000_movies_and_credits/tmdb_5000_movies.csv"
CREDITS_URL = "https://raw.githubusercontent.com/erkansirin78/datasets/master/tmdb_5000_movies_and_credits/tmdb_5000_credits.csv"

# Load movies
print("Downloading movies.csv metadata...")
movies = pd.read_csv(MOVIES_URL)
print(f"Loaded {len(movies)} movie records.")

# Load credits
print("Downloading credits.csv (cast and directors)...")
credits = pd.read_csv(CREDITS_URL)
print(f"Loaded {len(credits)} credit records.")

# Parse JSON strings inside the original columns
def parse_json_list(val, key_name="name"):
    if pd.isna(val):
        return ""
    try:
        data = ast.literal_eval(val)
        return " ".join([item[key_name].replace(" ", "") for item in data])
    except Exception:
        try:
            data = json.loads(val)
            return " ".join([item[key_name].replace(" ", "") for item in data])
        except Exception:
            return ""

def parse_cast(val):
    if pd.isna(val):
        return ""
    try:
        data = ast.literal_eval(val)
        # Extract top 4 cast names, removing spaces to make them single tokens
        names = [item['name'].replace(" ", "") for item in data[:4]]
        return " ".join(names)
    except Exception:
        return ""

def parse_director(val):
    if pd.isna(val):
        return ""
    try:
        data = ast.literal_eval(val)
        for item in data:
            if item.get("job") == "Director":
                return item["name"].replace(" ", "")
        return ""
    except Exception:
        return ""

print("Processing and cleaning movie metadata...")
# Parse genres and keywords
movies["genres_parsed"] = movies["genres"].apply(parse_json_list)
movies["keywords_parsed"] = movies["keywords"].apply(parse_json_list)

# Parse cast and director from credits
print("Processing cast and directors...")
credits["cast_parsed"] = credits["cast"].apply(parse_cast)
credits["director_parsed"] = credits["crew"].apply(parse_director)

# Merge datasets
merged = pd.merge(movies, credits, on="title")

# Extract release year
def extract_year(date_str):
    if pd.isna(date_str):
        return 2000
    match = re.search(r"(\d{4})", str(date_str))
    if match:
        return int(match.group(1))
    return 2000

merged["release_year"] = merged["release_date"].apply(extract_year)

# Ensure vote counts and average columns are clean
merged["vote_average"] = merged["vote_average"].fillna(0.0)
merged["vote_count"] = merged["vote_count"].fillna(0)

# Build dynamic fallback Unsplash visual posters based on genre themes
def get_poster_path(genres):
    genres_lower = str(genres).lower()
    if "animation" in genres_lower or "family" in genres_lower:
        return "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400&auto=format&fit=crop"
    if "sciencefiction" in genres_lower or "action" in genres_lower:
        return "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=400&auto=format&fit=crop"
    if "horror" in genres_lower or "thriller" in genres_lower:
        return "https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=400&auto=format&fit=crop"
    if "comedy" in genres_lower:
        return "https://images.unsplash.com/photo-1514302240736-b1fee5985889?q=80&w=400&auto=format&fit=crop"
    if "music" in genres_lower or "romance" in genres_lower:
        return "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=400&auto=format&fit=crop"
    return "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=400&auto=format&fit=crop"

merged["poster_path"] = merged["genres_parsed"].apply(get_poster_path)

# Prepare clean final output columns matching our schema
final_df = pd.DataFrame()
final_df["id"] = merged["id"]
final_df["title"] = merged["title"]
final_df["genres"] = merged["genres_parsed"]
final_df["overview"] = merged["overview"].fillna("")
final_df["cast"] = merged["cast_parsed"]
final_df["director"] = merged["director_parsed"]
final_df["keywords"] = merged["keywords_parsed"]
final_df["vote_average"] = merged["vote_average"]
final_df["vote_count"] = merged["vote_count"]
final_df["release_year"] = merged["release_year"]
final_df["poster_path"] = merged["poster_path"]

# Drop duplicate titles to ensure clean content mapping dictionary
final_df = final_df.drop_duplicates(subset=["title"])

# Export directly to data/movies.csv
os.makedirs("data", exist_ok=True)
final_df.to_csv("data/movies.csv", index=False)

print(f"\nSUCCESS: Preprocessed and consolidated all {len(final_df)} TMDB movies!")
