// CINE MATCH DYNAMIC CONTROLLER SCRIPT

// Application State
let moviesList = [];
let userRatings = JSON.parse(localStorage.getItem("cineMatchRatings")) || {};
let activeMovie = null;
let lastSearchedTitle = null;

// DOM Elements
const elements = {
    searchBar: document.getElementById("movie-search"),
    searchBtn: document.getElementById("search-btn"),
    autocompleteList: document.getElementById("autocomplete-suggestions"),
    catalogGrid: document.getElementById("catalog-grid"),
    showcaseSection: document.getElementById("search-result-showcase"),
    similarSection: document.getElementById("similar-section"),
    similarGrid: document.getElementById("similar-movies-grid"),
    ratedList: document.getElementById("rated-movies-list"),
    collabContainer: document.getElementById("collaborative-suggestions-container"),
    modal: document.getElementById("movie-modal"),
    modalClose: document.querySelector(".modal-close"),
    modalPoster: document.getElementById("modal-poster"),
    modalTitle: document.getElementById("modal-title"),
    modalYear: document.getElementById("modal-year"),
    modalRating: document.getElementById("modal-rating"),
    modalDirector: document.getElementById("modal-director"),
    modalGenres: document.getElementById("modal-genres"),
    modalOverview: document.getElementById("modal-overview"),
    modalCast: document.getElementById("modal-cast"),
    modalRecommendBtn: document.getElementById("modal-recommend-btn"),
    modalRatingStars: document.querySelector(".star-rating-interactive"),
    clearSelectedBtn: document.getElementById("clear-selected-btn"),
    toast: document.getElementById("toast"),
    // Filter controls
    filterGenre: document.getElementById("filter-genre"),
    filterRating: document.getElementById("filter-rating"),
    ratingVal: document.getElementById("rating-val"),
    filterHiddenGems: document.getElementById("filter-hidden-gems"),
    // Dynamic Trailer Video elements
    modalPlayBtn: document.getElementById("modal-play-btn"),
    videoOverlay: document.getElementById("modal-video-overlay"),
    videoIframe: document.getElementById("modal-video-iframe"),
    closeVideoBtn: document.getElementById("close-video-btn"),
    videoExternalBtn: document.getElementById("modal-video-external-btn"),
    videoStatusText: document.getElementById("modal-video-status-text")
};

// Initialize Application safely handling DOM loading race conditions
if (document.readyState === "complete" || document.readyState === "interactive") {
    initializeApp();
} else {
    document.addEventListener("DOMContentLoaded", initializeApp);
}

async function initializeApp() {
    // 1. Fetch entire catalog
    await fetchCatalog();
    
    // 2. Render initial listings
    renderCatalog();
    renderUserRatingsList();
    fetchCollaborativeSuggestions();

    // 3. Setup event listeners
    setupEventListeners();
    setupFilterListeners();
}

// Fetch complete catalog from the backend API
async function fetchCatalog() {
    try {
        const response = await fetch("/api/movies");
        if (response.ok) {
            moviesList = await response.json();
        } else {
            showToast("Failed to load catalog data from server.", "error");
        }
    } catch (err) {
        console.error("Error fetching catalog:", err);
        showToast("Server connection error.", "error");
    }
}

// Render dynamic catalog list on the dashboard
function renderCatalog(filteredList = null) {
    elements.catalogGrid.innerHTML = "";
    
    let displayList = [];
    if (filteredList) {
        displayList = filteredList;
    } else {
        if (moviesList.length === 0) {
            elements.catalogGrid.innerHTML = `<div class="empty-state"><p>No movies available</p></div>`;
            return;
        }
        // Sort by weighted rating score to show top 24 masterpieces for instant butter-smooth loading
        displayList = [...moviesList]
            .sort((a, b) => (b.vote_average * b.vote_count) - (a.vote_average * a.vote_count))
            .slice(0, 24);
    }

    if (displayList.length === 0) {
        elements.catalogGrid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-face-frown" style="font-size:2rem; color:var(--text-muted);"></i><p style="margin-top:0.5rem;">No movies match your filters.</p></div>`;
        return;
    }

    displayList.forEach(movie => {
        const card = createMovieCard(movie);
        elements.catalogGrid.appendChild(card);
    });
}

// Create a single beautiful movie card element
function createMovieCard(movie, matchPct = null) {
    const card = document.createElement("div");
    card.className = "movie-card";
    
    const userScore = userRatings[movie.title] || 0;
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
        const starClass = i <= userScore ? "fa-solid fa-star active" : "fa-regular fa-star";
        starsHtml += `<i class="${starClass}" data-value="${i}"></i>`;
    }

    const matchBadgeHtml = matchPct ? `<span class="badge match-badge">${matchPct}% Match</span>` : "";

    card.innerHTML = `
        <div class="movie-poster-wrapper">
            ${matchBadgeHtml}
            <img class="movie-poster" src="${movie.poster_path}" alt="${movie.title}" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=400&auto=format&fit=crop'">
            <div class="movie-card-overlay"></div>
        </div>
        <div class="movie-card-info">
            <h4>${movie.title}</h4>
            <div class="movie-card-meta">
                <span>${movie.release_year}</span>
                <span class="rating-star-container">
                    <i class="fa-solid fa-star"></i>
                    ${movie.vote_average.toFixed(1)}
                </span>
            </div>
            <div class="movie-rating-widget">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Rate:</span>
                <div class="card-stars" data-title="${movie.title}">
                    ${starsHtml}
                </div>
            </div>
        </div>
    `;

    // Click on card opens detailed info modal (unless clicking rating stars)
    card.addEventListener("click", (e) => {
        if (!e.target.closest(".movie-rating-widget")) {
            openMovieModal(movie);
        }
    });
    
    // Add star ratings click listener directly
    card.querySelectorAll(".card-stars i").forEach(star => {
        star.addEventListener("click", (e) => {
            e.stopPropagation();
            const rating = parseInt(star.getAttribute("data-value"));
            
            // Instantly update local card visual stars without lag
            card.querySelectorAll(".card-stars i").forEach((s, idx) => {
                s.className = idx < rating ? "fa-solid fa-star active" : "fa-regular fa-star";
            });
            
            submitRating(movie.title, rating, false); // pass false to avoid heavy catalog re-draw
        });
    });

    return card;
}

// Event Listeners setup
function setupEventListeners() {
    // Autocomplete input tracking
    elements.searchBar.addEventListener("input", handleSearchInput);
    
    // Clicking anywhere else closes autocomplete list
    document.addEventListener("click", (e) => {
        if (!elements.searchBar.contains(e.target) && !elements.autocompleteList.contains(e.target)) {
            elements.autocompleteList.classList.add("hidden");
        }
    });

    // Handle search button
    elements.searchBtn.addEventListener("click", () => {
        const query = elements.searchBar.value.trim();
        performSearch(query);
    });

    elements.searchBar.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const query = elements.searchBar.value.trim();
            performSearch(query);
        }
    });

    // Helper to stop running trailers when modal is closed
    const closeMovieModalHandler = () => {
        elements.modal.classList.add("hidden");
        // Clear iframe source to stop video/audio immediately
        elements.videoIframe.src = "";
        elements.videoOverlay.classList.add("hidden");
    };

    // Modal elements action
    elements.modalClose.addEventListener("click", closeMovieModalHandler);
    elements.modal.addEventListener("click", (e) => {
        if (e.target === elements.modal) {
            closeMovieModalHandler();
        }
    });

    // Request recommendations from modal selection
    elements.modalRecommendBtn.addEventListener("click", () => {
        if (activeMovie) {
            closeMovieModalHandler();
            triggerContentRecommendations(activeMovie.title);
        }
    });

    // Trailer Mapping Dictionary for seamless embedded trailer playbacks
    const TRAILER_IDS = {
        "inception": "YoHD9XEInc0",
        "the dark knight": "EXeTwQWrcwY",
        "avatar": "5PSNL1q3fcg",
        "titanic": "CHekzSiZjrY",
        "the avengers": "eOrNdBpGMv8",
        "toy story": "tN1A2mVnROM",
        "toy story 2": "tN1A2mVnROM",
        "toy story 3": "tN1A2mVnROM",
        "finding nemo": "2zLkasScy7A",
        "interstellar": "zSWdZAAMPQE",
        "the prestige": "o4gHCmTQDVI",
        "gladiator": "ol67qo3whJk",
        "iron man": "8hYlB38asDY",
        "iron man 2": "8hYlB38asDY",
        "iron man 3": "oYSD2VQAGC4",
        "batman begins": "neY2xAx9bmA",
        "spider-man 3": "wPosLg3z11A",
        "spectre": "z4UDNzXD3qA",
        "jurassic world": "RFinNxS5KN4",
        "the dark knight rises": "g8evyE9TuYk",
        "skyfall": "6kw1UVovByw",
        "harry potter and the half-blood prince": "tAiy66830U4",
        "the matrix": "vKQi3bBA1y8",
        "star wars: the force awakens": "sGbxmsDFVnE",
        "wall-e": "CZ1CATHerQ0",
        "wall·e": "CZ1CATHerQ0",
        "cars": "2zghHU5obdQ",
        "cars 2": "oFTfAdauCOo",
        "memento": "4CV41hoyS8A",
        "insomnia": "brBf6f8Lz5w",
        "a bug's life": "Ljk2YJ53_WI",
        "john carter": "nlvYKl1fZBI",
        "up": "ORFWdXl_zJ4",
        "the hobbit: the battle of the five armies": "iVAgTiBrrDA",
        "the hobbit: the desolation of smaug": "fnaojlFdU34",
        "monsters university": "xBzPioph8CI",
        "brave": "TEHWDA_687s",
        "tangled": "2f51Ij30NUs"
    };

    // Widescreen Movie Trailer Play button
    elements.modalPlayBtn.addEventListener("click", () => {
        if (activeMovie) {
            const cleanTitle = activeMovie.title.toLowerCase().trim();
            const videoId = TRAILER_IDS[cleanTitle];
            
            let embedUrl = "";
            const query = `${activeMovie.title} ${activeMovie.release_year} official trailer`;
            const directUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            
            if (videoId) {
                // Plays mapped official trailer inside iframe
                embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
                elements.videoStatusText.innerHTML = `<i class="fa-solid fa-circle-play" style="color:var(--accent);"></i> Playing Official Trailer`;
                showToast(`Dimming lights... Playing trailer for "${activeMovie.title}"`, "success");
            } else {
                // Plays elegant cinematic intro video in iframe and advises clicking "Watch on YouTube"
                embedUrl = `https://www.youtube.com/embed/t7S1-6P2Pec?autoplay=1&rel=0&start=5`; // IMAX Cinema Countdown
                elements.videoStatusText.innerHTML = `<i class="fa-solid fa-circle-info" style="color:var(--primary);"></i> Cinema Preview (Click 'Watch on YouTube' for Full Trailer)`;
                showToast(`Playing cinema intro. Click "Watch on YouTube" for full trailer!`, "info");
            }
            
            elements.videoIframe.src = embedUrl;
            elements.videoExternalBtn.href = directUrl; // Set target direct link
            elements.videoOverlay.classList.remove("hidden");
        }
    });

    // Close widescreen trailer back to details panel
    elements.closeVideoBtn.addEventListener("click", () => {
        elements.videoIframe.src = ""; // Stop video/audio
        elements.videoOverlay.classList.add("hidden");
    });

    // Clear currently selected search outcome and reset catalog
    elements.clearSelectedBtn.addEventListener("click", () => {
        elements.showcaseSection.classList.add("hidden");
        elements.similarSection.classList.add("hidden");
        elements.searchBar.value = "";
        lastSearchedTitle = null;
        renderCatalog(); // Reset explore catalog back to top popular
    });

    // Star rating inside detailed modal popup window
    elements.modalRatingStars.querySelectorAll("i").forEach(star => {
        star.addEventListener("click", () => {
            const rating = parseInt(star.getAttribute("data-value"));
            const title = elements.modalRatingStars.getAttribute("data-movie");
            submitRating(title, rating);
            
            // Instantly sync modal visual stars
            updateModalStars(rating);
        });
    });

    // Toggles active state highlighting inside header and mobile bottom navigation links
    const navLinks = document.querySelectorAll(".nav-links a, .mobile-nav-item");
    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            const targetHref = link.getAttribute("href");
            navLinks.forEach(l => {
                if (l.getAttribute("href") === targetHref) {
                    l.classList.add("active");
                } else {
                    l.classList.remove("active");
                }
            });
        });
    });

    // Premium Scrollspy system using IntersectionObserver for high-end UI/UX feedback
    if ("IntersectionObserver" in window) {
        const sections = [
            document.getElementById("discover"),
            document.getElementById("ratings"),
            document.getElementById("recommendations")
        ];
        
        const observerOptions = {
            root: null,
            rootMargin: "-20% 0px -55% 0px", // Trigger active state when section is around top-middle
            threshold: 0
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute("id");
                    // Sync active status on scroll across all matching navigation anchors
                    navLinks.forEach(l => {
                        if (l.getAttribute("href") === `#${id}`) {
                            l.classList.add("active");
                        } else {
                            l.classList.remove("active");
                        }
                    });
                }
            });
        }, observerOptions);
        
        sections.forEach(section => {
            if (section) observer.observe(section);
        });
    }
}

// Live Search Autocomplete logic
function handleSearchInput() {
    const val = elements.searchBar.value.trim().toLowerCase();
    elements.autocompleteList.innerHTML = "";
    
    if (!val) {
        elements.autocompleteList.classList.add("hidden");
        return;
    }

    const matches = moviesList.filter(m => 
        m.title.toLowerCase().includes(val) || 
        m.genres.toLowerCase().includes(val)
    ).slice(0, 6);

    if (matches.length === 0) {
        elements.autocompleteList.classList.add("hidden");
        return;
    }

    matches.forEach(movie => {
        const item = document.createElement("div");
        item.className = "autocomplete-item";
        item.innerHTML = `
            <img class="autocomplete-poster" src="${movie.poster_path}" alt="${movie.title}" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=400&auto=format&fit=crop'">
            <div class="autocomplete-details">
                <h4>${movie.title}</h4>
                <p>${movie.genres.split(" ").slice(0,2).join(", ")} &bull; ${movie.release_year}</p>
            </div>
        `;

        item.addEventListener("click", () => {
            elements.searchBar.value = movie.title;
            elements.autocompleteList.classList.add("hidden");
            performSearch(movie.title); // Instantly filter catalog and show similarities
        });

        elements.autocompleteList.appendChild(item);
    });

    elements.autocompleteList.classList.remove("hidden");
}

// Setup Filter Event Listeners
function setupFilterListeners() {
    // Rating slider numeric feedback
    elements.filterRating.addEventListener("input", () => {
        elements.ratingVal.textContent = parseFloat(elements.filterRating.value).toFixed(1);
    });

    // Auto-update recommendations on any filter adjust
    const triggerFilterUpdate = () => {
        // 1. Recalculate content recommendations if we have a current active search
        if (lastSearchedTitle) {
            triggerContentRecommendations(lastSearchedTitle);
        }
        // 2. Recalculate collaborative suggestions
        fetchCollaborativeSuggestions();
    };

    elements.filterGenre.addEventListener("change", triggerFilterUpdate);
    elements.filterRating.addEventListener("change", triggerFilterUpdate);
    elements.filterHiddenGems.addEventListener("change", triggerFilterUpdate);
}

// Trigger detailed content recommendations via API
async function triggerContentRecommendations(title) {
    try {
        lastSearchedTitle = title; // Record state
        
        const genre = elements.filterGenre.value;
        const minRating = elements.filterRating.value;
        const hiddenGems = elements.filterHiddenGems.checked;

        const response = await fetch(`/api/recommend?title=${encodeURIComponent(title)}&genre=${encodeURIComponent(genre)}&min_rating=${minRating}&hidden_gems=${hiddenGems}`);
        if (!response.ok) {
            const errData = await response.json();
            showToast(errData.error || "Recommendation error.", "error");
            return;
        }

        const data = await response.json();
        
        // Show selected movie in showcase panel
        renderShowcaseCard(data.searched_movie);
        
        // Show similar movies grid
        renderSimilarMovies(data.recommendations);
        
        // Smooth scroll to display panel
        elements.showcaseSection.scrollIntoView({ behavior: "smooth" });

    } catch (err) {
        console.error("Error generating recommendations:", err);
        showToast("Error connecting to recommender engine.", "error");
    }
}

// Search and Catalog filtering controller
function performSearch(query) {
    if (!query) {
        renderCatalog(); // reset explore catalog
        elements.showcaseSection.classList.add("hidden");
        elements.similarSection.classList.add("hidden");
        lastSearchedTitle = null;
        return;
    }

    // 1. Filter the entire 4,800 database for titles containing the search query
    const queryLower = query.toLowerCase().trim();
    const filtered = moviesList.filter(m => 
        m.title.toLowerCase().includes(queryLower) || 
        m.genres.toLowerCase().includes(queryLower)
    );

    // 2. Render only the matching list in the Explore Catalog
    renderCatalog(filtered.slice(0, 24));

    // 3. Highlight similarities and showcase details for the closest match
    if (filtered.length > 0) {
        triggerContentRecommendations(filtered[0].title);
    } else {
        elements.showcaseSection.classList.add("hidden");
        elements.similarSection.classList.add("hidden");
        showToast(`No movies found matching "${query}"`, "warning");
    }
}

// Render Showcase Panel card
function renderShowcaseCard(movie) {
    const showcaseContent = elements.showcaseSection.querySelector(".showcase-content");
    
    const userScore = userRatings[movie.title] || 0;
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
        const starClass = i <= userScore ? "fa-solid fa-star active" : "fa-regular fa-star";
        starsHtml += `<i class="${starClass}" data-value="${i}"></i>`;
    }

    const genresHtml = movie.genres.split(" ").map(g => `<span class="genre-tag genre-tag-accent">${g}</span>`).join("");

    showcaseContent.innerHTML = `
        <div class="showcase-details">
            <img class="showcase-poster" src="${movie.poster_path}" alt="${movie.title}" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=400&auto=format&fit=crop'">
            <div class="showcase-info">
                <h3>${movie.title}</h3>
                <div class="meta-row">
                    <span class="badge">${movie.release_year}</span>
                    <span class="badge bg-gold"><i class="fa-solid fa-star"></i> ${movie.vote_average.toFixed(1)}</span>
                    <span style="font-size:0.9rem; color:var(--text-muted);">Director: <strong>${movie.director}</strong></span>
                </div>
                <div class="genres-wrapper">
                    ${genresHtml}
                </div>
                <p class="overview">${movie.overview}</p>
                <div style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 1.5rem;">
                    <strong>Starring:</strong> ${movie.cast.split(" ").slice(0,4).join(" ")}
                </div>
                <div class="modal-interactive-row" style="border:none; padding:0; margin:0;">
                    <div class="interactive-rating-block">
                        <span>Your Rating:</span>
                        <div class="star-rating-interactive" data-movie="${movie.title}">
                            ${starsHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Click ratings in showcase card
    showcaseContent.querySelectorAll(".star-rating-interactive i").forEach(star => {
        star.addEventListener("click", () => {
            const rating = parseInt(star.getAttribute("data-value"));
            submitRating(movie.title, rating);
            
            // Re-render showcase to display new rating
            renderShowcaseCard(movie);
        });
    });

    elements.showcaseSection.classList.remove("hidden");
}

// Render similar movies row
function renderSimilarMovies(movies) {
    elements.similarGrid.innerHTML = "";
    if (movies.length === 0) {
        elements.similarGrid.innerHTML = `<div class="empty-state"><p>No related similarities found.</p></div>`;
        return;
    }

    movies.forEach(movie => {
        const card = createMovieCard(movie);
        elements.similarGrid.appendChild(card);
    });

    elements.similarSection.classList.remove("hidden");
}

// Open detailed info modal popup window
function openMovieModal(movie) {
    activeMovie = movie;
    
    // Reset cinematic trailer player overlay to clean state
    elements.videoIframe.src = "";
    elements.videoOverlay.classList.add("hidden");

    elements.modalPoster.src = movie.poster_path;
    elements.modalTitle.textContent = movie.title;
    elements.modalYear.textContent = movie.release_year;
    elements.modalRating.innerHTML = `<i class="fa-solid fa-star"></i> ${movie.vote_average.toFixed(1)}`;
    elements.modalDirector.innerHTML = `Directed by <strong>${movie.director}</strong>`;
    elements.modalOverview.textContent = movie.overview;
    elements.modalCast.textContent = movie.cast;
    
    // Set genres tags
    elements.modalGenres.innerHTML = movie.genres.split(" ").map(g => `<span class="genre-tag">${g}</span>`).join("");
    
    // Initialize rating stars in modal
    elements.modalRatingStars.setAttribute("data-movie", movie.title);
    const currentRating = userRatings[movie.title] || 0;
    updateModalStars(currentRating);
    
    elements.modal.classList.remove("hidden");
}

// Sync modal interactive visual star components
function updateModalStars(rating) {
    elements.modalRatingStars.querySelectorAll("i").forEach(star => {
        const starVal = parseInt(star.getAttribute("data-value"));
        if (starVal <= rating) {
            star.className = "fa-solid fa-star active";
        } else {
            star.className = "fa-regular fa-star";
        }
    });
}

// Rating submission handler
function submitRating(movieTitle, score, reRenderCatalog = true) {
    userRatings[movieTitle] = score;
    localStorage.setItem("cineMatchRatings", JSON.stringify(userRatings));
    
    showToast(`Rated "${movieTitle}" ${score} stars!`, "success");
    
    // Sync dashboards in real-time
    if (reRenderCatalog) {
        renderCatalog();
    }
    renderUserRatingsList();
    fetchCollaborativeSuggestions();
}

// Delete user rating logs
function removeRating(movieTitle) {
    delete userRatings[movieTitle];
    localStorage.setItem("cineMatchRatings", JSON.stringify(userRatings));
    
    showToast(`Removed rating for "${movieTitle}"`, "info");
    
    renderCatalog();
    renderUserRatingsList();
    fetchCollaborativeSuggestions();
}

// Render list of rated movies inside Taste station card
function renderUserRatingsList() {
    elements.ratedList.innerHTML = "";
    const ratedTitles = Object.keys(userRatings);
    
    if (ratedTitles.length === 0) {
        elements.ratedList.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-star"></i>
                <p>No ratings registered yet. Click on any movie's star rating to begin!</p>
            </div>
        `;
        return;
    }

    ratedTitles.forEach(title => {
        const score = userRatings[title];
        const movie = moviesList.find(m => m.title === title) || { 
            poster_path: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=400&auto=format&fit=crop", 
            release_year: "N/A" 
        };

        const item = document.createElement("div");
        item.className = "rated-movie-item";
        item.innerHTML = `
            <img class="rated-movie-poster" src="${movie.poster_path}" alt="${title}" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=400&auto=format&fit=crop'">
            <div class="rated-movie-details">
                <h4>${title}</h4>
                <p>${movie.release_year}</p>
            </div>
            <div class="rated-movie-score">
                <i class="fa-solid fa-star"></i>
                <span>${score}</span>
                <i class="fa-solid fa-trash-can" style="color:var(--text-muted); cursor:pointer; font-size:0.75rem; margin-left: 0.25rem;" title="Delete rating"></i>
            </div>
        `;

        // trash can deletion listener
        item.querySelector(".fa-trash-can").addEventListener("click", (e) => {
            e.stopPropagation();
            removeRating(title);
        });

        // click on item to show content recommendations
        item.addEventListener("click", () => {
            triggerContentRecommendations(title);
        });

        elements.ratedList.appendChild(item);
    });
}

// Fetch Collaborative recommendations based on user rating weights from API
async function fetchCollaborativeSuggestions() {
    const ratingsCount = Object.keys(userRatings).length;
    
    // Require at least 3 rated items for simulated collaborative calculation
    if (ratingsCount < 3) {
        elements.collabContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;">
                <i class="fa-solid fa-bolt text-accent" style="font-size: 2.5rem; filter: drop-shadow(0 0 10px rgba(217, 70, 239, 0.4));"></i>
                <h4 style="margin-top: 1rem; font-weight: 600;">Personalized Suggestions Await</h4>
                <p style="max-width: 450px; margin: 0.5rem auto 0; font-size: 0.9rem; color: var(--text-muted);">
                    Add ${3 - ratingsCount} more movie rating(s) to activate your AI Collaborative recommendations!
                </p>
            </div>
        `;
        return;
    }

    try {
        const genre = elements.filterGenre.value;
        const minRating = parseFloat(elements.filterRating.value);
        const hiddenGems = elements.filterHiddenGems.checked;

        const response = await fetch("/api/collaborative", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                ratings: userRatings,
                genre: genre,
                min_rating: minRating,
                hidden_gems: hiddenGems
            })
        });

        if (response.ok) {
            const recommendations = await response.json();
            renderCollaborativeSuggestions(recommendations);
        }
    } catch (err) {
        console.error("Collaborative error fetching:", err);
    }
}

// Render simulated collaborative filtering recommendations
function renderCollaborativeSuggestions(movies) {
    elements.collabContainer.innerHTML = "";
    if (movies.length === 0) {
        elements.collabContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 2rem;">
                <p>No matching personalized recommendations found for current filters. Try relaxing your filters!</p>
            </div>
        `;
        return;
    }

    movies.forEach((movie, idx) => {
        const pct = 98 - (idx * 3); // simulated match percentage gradient
        const card = createMovieCard(movie, pct); // Render full movie-card with match-badge overlay!
        elements.collabContainer.appendChild(card);
    });
}

// Display Premium alert notification toaster
function showToast(message, type = "success") {
    elements.toast.innerHTML = "";
    
    let icon = "fa-solid fa-circle-check";
    let color = "var(--primary)";
    
    if (type === "error") {
        icon = "fa-solid fa-circle-exclamation";
        color = "#ef4444";
    } else if (type === "warning") {
        icon = "fa-solid fa-triangle-exclamation";
        color = "#f59e0b";
    } else if (type === "info") {
        icon = "fa-solid fa-circle-info";
        color = "var(--accent)";
    }
    
    elements.toast.style.borderColor = color;
    elements.toast.innerHTML = `<i class="${icon}" style="color:${color};"></i> <span>${message}</span>`;
    
    elements.toast.classList.remove("hidden");
    
    // Fade out after 3.5 seconds
    setTimeout(() => {
        elements.toast.classList.add("hidden");
    }, 3500);
}
