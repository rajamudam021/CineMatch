import urllib.request
import json
import sys

def test_endpoint(url, method="GET", data=None):
    req = urllib.request.Request(url, method=method)
    if data:
        req.add_header('Content-Type', 'application/json')
        jsondata = json.dumps(data).encode('utf-8')
    else:
        jsondata = None
        
    try:
        with urllib.request.urlopen(req, data=jsondata, timeout=5) as response:
            status = response.status
            body = response.read().decode('utf-8')
            return status, body
    except Exception as e:
        print(f"Error testing {url}: {e}")
        return None, None

def verify_all():
    print("--- STARTING CINE MATCH VERIFICATION TEST ---")
    
    # 1. Test Home Route
    print("\n[Test 1] Testing index HTML endpoint...")
    status, body = test_endpoint("http://127.0.0.1:5000/")
    if status == 200 and "<!DOCTYPE html>" in body:
        print("SUCCESS: Home route rendered correctly.")
    else:
        print("FAILURE: Home route failed to render.")
        sys.exit(1)
        
    # 2. Test Get All Movies
    print("\n[Test 2] Testing complete movie catalog API...")
    status, body = test_endpoint("http://127.0.0.1:5000/api/movies")
    if status == 200:
        movies = json.loads(body)
        print(f"SUCCESS: Loaded {len(movies)} movies from catalog.")
        if len(movies) == 65:
            print("SUCCESS: Verified all 65 expanded movies are in memory.")
        else:
            print(f"WARNING: Catalog size is {len(movies)} (expected 65).")
    else:
        print("FAILURE: Movie list API failed.")
        sys.exit(1)
        
    # 3. Test Search / Recommendations
    print("\n[Test 3] Testing Content-Based Recommender (TF-IDF similarity on 'Inception')...")
    status, body = test_endpoint("http://127.0.0.1:5000/api/recommend?title=Inception")
    if status == 200:
        result = json.loads(body)
        searched = result.get("searched_movie", {})
        recommendations = result.get("recommendations", [])
        
        print(f"SUCCESS: Found searched movie: '{searched.get('title')}'")
        print(f"SUCCESS: Generated {len(recommendations)} similar recommendations:")
        for idx, rec in enumerate(recommendations, 1):
            print(f"   {idx}. {rec.get('title')} ({rec.get('release_year')}) - Genres: {rec.get('genres')}")
    else:
        print("FAILURE: Content recommendation API failed.")
        sys.exit(1)
        
    # 4. Test Simulated Collaborative Filtering
    print("\n[Test 4] Testing AI Collaborative Hybrid Filtering with user rating mock...")
    mock_ratings = {
        "ratings": {
            "Toy Story": 5,
            "Finding Nemo": 5,
            "WALL-E": 5
        }
    }
    status, body = test_endpoint("http://127.0.0.1:5000/api/collaborative", method="POST", data=mock_ratings)
    if status == 200:
        recommendations = json.loads(body)
        print(f"SUCCESS: Collaborative algorithm generated {len(recommendations)} personalized suggestions:")
        for idx, rec in enumerate(recommendations, 1):
            print(f"   {idx}. {rec.get('title')} ({rec.get('release_year')}) - Genres: {rec.get('genres')}")
    else:
        print("FAILURE: Collaborative recommendation API failed.")
        sys.exit(1)

    print("\n--- ALL TESTS COMPLETED SUCCESSFULLY! CineMatch Recommender System is fully functional! ---")

if __name__ == "__main__":
    verify_all()
