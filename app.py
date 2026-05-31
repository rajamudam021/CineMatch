from flask import Flask, jsonify, request, render_template
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
import os

app = Flask(__name__)

# Load the dataset
CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "movies.csv")
movies_df = pd.read_csv(CSV_PATH)

# Clean fields and fill missing values
movies_df["genres"] = movies_df["genres"].fillna("")
movies_df["overview"] = movies_df["overview"].fillna("")
movies_df["cast"] = movies_df["cast"].fillna("")
movies_df["director"] = movies_df["director"].fillna("")
movies_df["keywords"] = movies_df["keywords"].fillna("")

# Create a combined tag column for content-based similarity calculation
# Adding weight to genres, director, and keywords by repeating them
def create_soup(x):
    return (x['genres'] + " ") * 3 + x['overview'] + " " + (x['cast'] + " ") + (x['director'] + " ") * 3 + x['keywords']

movies_df["soup"] = movies_df.apply(create_soup, axis=1)

# Fit TF-IDF Vectorizer on combined soups
tfidf = TfidfVectorizer(stop_words="english")
tfidf_matrix = tfidf.fit_transform(movies_df["soup"])

# Compute Cosine Similarity Matrix
cosine_sim = cosine_similarity(tfidf_matrix, tfidf_matrix)

# Helper function to get index from title (case-insensitive and fuzzy matching)
def get_movie_index(title):
    title_clean = re.sub(r"[^a-zA-Z0-9\s]", "", title.lower().strip())
    for idx, row in movies_df.iterrows():
        row_title_clean = re.sub(r"[^a-zA-Z0-9\s]", "", str(row["title"]).lower().strip())
        if row_title_clean == title_clean:
            return idx
    return None

@app.route("/")
def home():
    # Return index.html from templates
    return render_template("index.html")

@app.route("/api/movies", methods=["GET"])
def get_all_movies():
    # Simple endpoint returning all available movies for the UI to list or populate
    return jsonify(movies_df.to_dict(orient="records"))

@app.route("/api/search", methods=["GET"])
def search_movies():
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify([])
    
    # Simple matching logic on title, genres, or keywords
    matches = []
    for _, row in movies_df.iterrows():
        title = str(row["title"])
        genres = str(row["genres"])
        if query in title.lower() or query in genres.lower():
            matches.append(row.to_dict())
            
    return jsonify(matches[:10])

@app.route("/api/recommend", methods=["GET"])
def recommend_movies():
    title = request.args.get("title", "").strip()
    genre_filter = request.args.get("genre", "").strip().lower()
    min_rating = float(request.args.get("min_rating", 0))
    hidden_gems = request.args.get("hidden_gems", "false").lower() == "true"
    
    if not title:
        return jsonify({"error": "Movie title parameter is required."}), 400
    
    idx = get_movie_index(title)
    if idx is None:
        return jsonify({"error": f"Movie '{title}' not found in dataset."}), 404
        
    # Get pairwise similarity scores for this movie
    sim_scores = list(enumerate(cosine_sim[idx]))
    
    # Sort the movies based on similarity scores
    sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
    
    # Exclude itself
    sim_scores = [item for item in sim_scores if item[0] != idx]
    
    # Apply filtering inside recommendations dynamically
    recommended_indices = []
    
    # Define a threshold for "hidden gems" (lower vote count but highly rated)
    # Median vote count of movies with >0 votes
    non_zero_votes = movies_df[movies_df["vote_count"] > 100]["vote_count"]
    vote_count_threshold = non_zero_votes.median() if not non_zero_votes.empty else 1000
    
    for movie_idx, sim in sim_scores:
        row = movies_df.iloc[movie_idx]
        
        # Genre filter
        if genre_filter and genre_filter not in str(row["genres"]).lower():
            continue
            
        # Rating filter
        if row["vote_average"] < min_rating:
            continue
            
        # Hidden gems filter (lesser known but highly rated)
        if hidden_gems:
            # Must have lower than average vote count, but vote average above 6.8
            if row["vote_count"] > vote_count_threshold or row["vote_average"] < 6.8:
                continue
                
        recommended_indices.append(movie_idx)
        if len(recommended_indices) >= 6:
            break
            
    # If filters are too strict, try falling back by ignoring hidden_gems first, then min_rating
    if len(recommended_indices) < 2:
        recommended_indices = []
        for movie_idx, sim in sim_scores:
            row = movies_df.iloc[movie_idx]
            if genre_filter and genre_filter not in str(row["genres"]).lower():
                continue
            recommended_indices.append(movie_idx)
            if len(recommended_indices) >= 6:
                break
                
    recommended_movies = movies_df.iloc[recommended_indices].to_dict(orient="records")
    
    return jsonify({
        "searched_movie": movies_df.iloc[idx].to_dict(),
        "recommendations": recommended_movies
    })

@app.route("/api/collaborative", methods=["POST"])
def collaborative_recommendations():
    """
    Simulated collaborative filtering based on user ratings.
    Expects JSON: { 
      "ratings": { "Movie Title 1": 5 },
      "genre": "Action",
      "min_rating": 7.0,
      "hidden_gems": true
    }
    We find similar movies for all positively rated movies (rating >= 3),
    weight by the user's score, apply advanced filters, and exclude movies already rated.
    """
    data = request.get_json() or {}
    user_ratings = data.get("ratings", {})
    genre_filter = data.get("genre", "").strip().lower()
    min_rating = float(data.get("min_rating", 0))
    hidden_gems = data.get("hidden_gems", False)
    
    if not user_ratings:
        return jsonify([])
        
    # Calculate similarity profile weighted by user's rating
    sim_accumulator = np.zeros(len(movies_df))
    rated_indices = set()
    
    has_positive_ratings = False
    
    for title, rating in user_ratings.items():
        idx = get_movie_index(title)
        if idx is not None:
            rated_indices.add(idx)
            # Weight: center around 0. Neutral/low ratings don't contribute positively to similarities
            weight = float(rating) - 2.5
            if weight > 0:
                has_positive_ratings = True
                sim_accumulator += cosine_sim[idx] * weight
                
    if not has_positive_ratings:
        # Fallback to general high popularity or random if user has only negative ratings
        top_indices = movies_df.sort_values(by="vote_average", ascending=False).index.tolist()
    else:
        # Zero out already rated movies so they aren't recommended
        for idx in rated_indices:
            sim_accumulator[idx] = -1.0
            
        # Get top indices sorted by similarity score
        top_indices = np.argsort(sim_accumulator)[::-1]
        
    # Define hidden gem thresholds
    non_zero_votes = movies_df[movies_df["vote_count"] > 100]["vote_count"]
    vote_count_threshold = non_zero_votes.median() if not non_zero_votes.empty else 1000
    
    final_indices = []
    for idx in top_indices:
        if idx in rated_indices:
            continue
            
        row = movies_df.iloc[idx]
        
        # Apply filters
        if genre_filter and genre_filter not in str(row["genres"]).lower():
            continue
        if row["vote_average"] < min_rating:
            continue
        if hidden_gems:
            if row["vote_count"] > vote_count_threshold or row["vote_average"] < 6.8:
                continue
                
        final_indices.append(idx)
        if len(final_indices) >= 6:
            break
            
    # Fallback if too strict
    if len(final_indices) < 2:
        final_indices = []
        for idx in top_indices:
            if idx in rated_indices:
                continue
            row = movies_df.iloc[idx]
            if genre_filter and genre_filter not in str(row["genres"]).lower():
                continue
            final_indices.append(idx)
            if len(final_indices) >= 6:
                break
                
    recommended = movies_df.iloc[final_indices].to_dict(orient="records")
    
    return jsonify(recommended)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
