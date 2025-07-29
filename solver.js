// Interactive Wordle Solver with Game Tracking
// This manages a complete game session with multiple guesses and feedback

let possibleWords = [];
let gameState = {
    isActive: false,
    guesses: [], // Array of {word, feedback, info}
    greens: ['', '', '', '', ''],
    yellows: [[], [], [], [], []],
    grays: [],
    currentGuess: null,
    isFirstGuess: true
};

// Load words.txt
fetch('words.txt')
    .then(response => response.text())
    .then(text => {
        possibleWords = text.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
        console.log(`Loaded ${possibleWords.length} words`);
    })
    .catch(err => {
        console.error('Failed to load words.txt:', err);
    });

function get_valid_guesses(possible, greens, yellows, grays) {
    return possible.filter(word => {
        // Check greens - must match exactly
        for (let i = 0; i < 5; i++) {
            if (greens[i] && word[i] !== greens[i]) return false;
        }
        
        // Check each position for yellow constraints
        for (let i = 0; i < 5; i++) {
            // If a letter is yellow at this position, it can't be in this position
            for (const y of (yellows[i] || [])) {
                if (word[i] === y) return false;
            }
            
            // Only block gray letters if they are not required as yellow elsewhere
            if (grays.includes(word[i])) {
                let isRequiredElsewhere = false;
                for (let j = 0; j < 5; j++) {
                    if (yellows[j] && yellows[j].includes(word[i])) {
                        isRequiredElsewhere = true;
                        break;
                    }
                }
                if (!isRequiredElsewhere) return false;
            }
        }
        
        // Ensure all yellow letters are present in the word
        for (let i = 0; i < 5; i++) {
            for (const y of (yellows[i] || [])) {
                if (!word.includes(y)) return false;
            }
        }
        
        return true;
    });
}

function get_feedback(guess, answer) {
    let feedback = Array(5).fill(0);
    let answer_chars = answer.split('');
    
    // First pass: mark exact matches (green)
    for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) {
            feedback[i] = 2;
            answer_chars[i] = null;
        }
    }
    
    // Second pass: mark position mismatches (yellow)
    for (let i = 0; i < 5; i++) {
        if (feedback[i] === 0 && answer_chars.includes(guess[i])) {
            feedback[i] = 1;
            answer_chars[answer_chars.indexOf(guess[i])] = null;
        }
    }
    return feedback.join('');
}

function get_all_feedback_patterns(guess, possible_words) {
    const patterns = {};
    for (const answer of possible_words) {
        const pattern = get_feedback(guess, answer);
        if (!patterns[pattern]) patterns[pattern] = [];
        patterns[pattern].push(answer);
    }
    return patterns;
}

function info_gain_for_guess(guess, possible_words) {
    const patterns = get_all_feedback_patterns(guess, possible_words);
    const total = possible_words.length;
    let info = 0.0;
    for (const words of Object.values(patterns)) {
        const new_space = words.length;
        if (new_space === 0) continue;
        const p = new_space / total;
        info += p * Math.log2(total / new_space);
    }
    return info;
}

async function get_best_guess(greens, yellows, grays, isFirst = false) {
    // Wait for words to load
    while (possibleWords.length === 0) {
        await new Promise(r => setTimeout(r, 50));
    }
    
    // Use optimal first guess
    if (isFirst) {
        return { guess: 'tares', info: 6.16, remaining: possibleWords.length };
    }
    
    let pos = get_valid_guesses(possibleWords, greens, yellows, grays);
    
    if (pos.length === 0) {
        return { guess: null, info: 0, remaining: 0, message: 'No possible guesses left.' };
    }
    
    if (pos.length === 1) {
        return { guess: pos[0], info: 0, remaining: 1, message: 'Only one possible answer.' };
    }
    
    // Sample for performance - use random sampling like Python version
    const sample_size = Math.min(8000, pos.length);
    let guess_list;
    if (pos.length <= sample_size) {
        guess_list = pos;
    } else {
        // Random sampling like Python's random.sample
        const shuffled = [...pos];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        guess_list = shuffled.slice(0, sample_size);
    }
    
    let best = null;
    let best_info = -1;
    
    for (const guess of guess_list) {
        const info = info_gain_for_guess(guess, pos);
        if (info > best_info) {
            best_info = info;
            best = guess;
        }
    }
    
    return { guess: best, info: best_info, remaining: pos.length };
}

function parseFeedback(feedbackStr, guess) {
    if (!feedbackStr || feedbackStr.length !== 5) {
        throw new Error('Feedback must be exactly 5 characters');
    }
    
    const validChars = 'gyb';
    for (let char of feedbackStr.toLowerCase()) {
        if (!validChars.includes(char)) {
            throw new Error('Feedback must only contain g, y, or b');
        }
    }
    
    return feedbackStr.toLowerCase();
}

function applyFeedback(feedback, guess) {
    for (let i = 0; i < 5; i++) {
        const letter = guess[i];
        const f = feedback[i];
        
        if (f === 'g') {
            gameState.greens[i] = letter;
        } else if (f === 'y') {
            if (!gameState.yellows[i].includes(letter)) {
                gameState.yellows[i].push(letter);
            }
        } else if (f === 'b') {
            // Only add to grays if this letter doesn't appear as yellow anywhere in this guess
            let isYellowElsewhere = false;
            for (let j = 0; j < 5; j++) {
                if (feedback[j] === 'y' && guess[j] === letter) {
                    isYellowElsewhere = true;
                    break;
                }
            }
            
            // Also check if it's not green elsewhere in this guess
            let isGreenElsewhere = false;
            for (let j = 0; j < 5; j++) {
                if (feedback[j] === 'g' && guess[j] === letter) {
                    isGreenElsewhere = true;
                    break;
                }
            }
            
            // Only add to grays if it's truly not in the word
            if (!isYellowElsewhere && !isGreenElsewhere && !gameState.grays.includes(letter)) {
                gameState.grays.push(letter);
            }
        }
    }
}

function renderVisualFeedback(feedback, guess) {
    const container = document.getElementById('visual-feedback');
    container.innerHTML = '';
    
    if (!feedback || !guess) return;
    
    for (let i = 0; i < 5; i++) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        box.textContent = guess[i];
        
        const f = feedback[i];
        if (f === 'g') {
            box.classList.add('letter-green');
        } else if (f === 'y') {
            box.classList.add('letter-yellow');
        } else {
            box.classList.add('letter-gray');
        }
        
        container.appendChild(box);
    }
}



function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-${type}`;
}

async function startNewGame() {
    // Reset game state
    gameState = {
        isActive: true,
        guesses: [],
        greens: ['', '', '', '', ''],
        yellows: [[], [], [], [], []],
        grays: [],
        currentGuess: null,
        isFirstGuess: true
    };
    
    // Get first guess
    const result = await get_best_guess(gameState.greens, gameState.yellows, gameState.grays, true);
    gameState.currentGuess = result.guess;
    
    // Update UI
    document.getElementById('current-guess-display').textContent = result.guess.toUpperCase();
    document.getElementById('guess-info').textContent = `Expected info: ${result.info.toFixed(3)} bits | ${result.remaining} possible answers`;
    document.getElementById('feedback-section').style.display = 'block';
    document.getElementById('feedback-input').value = '';
    document.getElementById('visual-feedback').innerHTML = '';
    
    // Update remaining answers display
    updateRemainingAnswers(possibleWords, result.guess);
    
    updateStatus(`New game started! Try the word: ${result.guess.toUpperCase()}`, 'info');
}

async function submitFeedback() {
    const feedbackInput = document.getElementById('feedback-input');
    const feedbackStr = feedbackInput.value.trim().toLowerCase();
    
    try {
        const feedback = parseFeedback(feedbackStr, gameState.currentGuess);
        
        // Apply feedback to game state BEFORE calculating remaining words
        applyFeedback(feedback, gameState.currentGuess);
        
        // Calculate remaining possibilities after applying feedback
        const remainingWords = get_valid_guesses(possibleWords, gameState.greens, gameState.yellows, gameState.grays);
        const remaining = remainingWords.length;
        
        // Store the guess with the calculated remaining count
        gameState.guesses.push({
            word: gameState.currentGuess,
            feedback: feedback,
            info: `${remaining} possible answers remaining`
        });
        
        // Show visual feedback
        renderVisualFeedback(feedback, gameState.currentGuess);
        
        // Debug logging
        console.log('Current game state:', {
            greens: gameState.greens,
            yellows: gameState.yellows,
            grays: gameState.grays,
            remaining: remaining
        });
        
        // Check if game is won
        if (feedback === 'ggggg') {
            updateStatus(`Congratulations! You found the word in ${gameState.guesses.length} guesses!`, 'success');
            document.getElementById('feedback-section').style.display = 'none';
            document.getElementById('remaining-answers-section').style.display = 'none';
            document.getElementById('current-guess-display').textContent = `🎉 SOLVED: ${gameState.currentGuess.toUpperCase()} 🎉`;
            document.getElementById('guess-info').textContent = '';
            gameState.isActive = false;
            return;
        }
        
        // Get next guess
        gameState.isFirstGuess = false;
        const result = await get_best_guess(gameState.greens, gameState.yellows, gameState.grays, false);
        
        if (!result.guess) {
            updateStatus(result.message || 'No more possible guesses!', 'warning');
            document.getElementById('feedback-section').style.display = 'none';
            document.getElementById('remaining-answers-section').style.display = 'none';
            document.getElementById('current-guess-display').textContent = 'Game Over - No solution found';
            document.getElementById('guess-info').textContent = '';
            gameState.isActive = false;
        } else {
            gameState.currentGuess = result.guess;
            document.getElementById('current-guess-display').textContent = result.guess.toUpperCase();
            document.getElementById('guess-info').textContent = `Expected info: ${result.info.toFixed(3)} bits | ${result.remaining} possible answers`;
            updateStatus(`Next guess: ${result.guess.toUpperCase()} (${result.remaining} possible answers, ${result.info.toFixed(3)} bits info)`, 'info');
            
            // Update remaining answers display
            updateRemainingAnswers(remainingWords, result.guess);
        }
        
        // Clear input and update history
        feedbackInput.value = '';
        renderGameHistory();
        updateRemainingAnswers(get_valid_guesses(possibleWords, gameState.greens, gameState.yellows, gameState.grays), gameState.currentGuess);
        
    } catch (error) {
        updateStatus(error.message, 'warning');
    }
}

function resetGame() {
    gameState.isActive = false;
    document.getElementById('current-guess-display').textContent = 'Click "New Game" to start!';
    document.getElementById('guess-info').textContent = '';
    document.getElementById('feedback-section').style.display = 'none';
    document.getElementById('visual-feedback').innerHTML = '';
    document.getElementById('history-list').innerHTML = 'No guesses yet';
    document.getElementById('remaining-answers-section').style.display = 'none';
    updateStatus('', 'info');
}

function updateRemainingAnswers(possibleAnswers, currentGuess) {
    const section = document.getElementById('remaining-answers-section');
    const container = document.getElementById('remaining-answers-list');
    
    if (possibleAnswers.length <= 10 && possibleAnswers.length > 1) {
        // Show the section
        section.style.display = 'block';
        
        // Clear previous content
        container.innerHTML = '';
        
        // Add count info
        const countInfo = document.createElement('p');
        countInfo.textContent = `${possibleAnswers.length} possible answers remaining:`;
        countInfo.style.marginBottom = '10px';
        countInfo.style.fontWeight = 'bold';
        container.appendChild(countInfo);
        
        // Create answer elements
        const answersContainer = document.createElement('div');
        answersContainer.className = 'remaining-answers';
        
        possibleAnswers.forEach(word => {
            const answerEl = document.createElement('span');
            answerEl.className = 'remaining-answer';
            answerEl.textContent = word.toUpperCase();
            
            // Highlight if it's the current guess
            if (currentGuess && word === currentGuess.toLowerCase()) {
                answerEl.classList.add('highlight');
            }
            
            answersContainer.appendChild(answerEl);
        });
        
        container.appendChild(answersContainer);
    } else {
        // Hide the section if more than 10 or exactly 1
        section.style.display = 'none';
    }
}

// Test function to verify the bug fix
function testBurntCase() {
    // Simulate the state after TARES (all black) and FORTY (f=b, o=b, r=g, t=y, y=y)
    const testGreens = ['', '', 'r', '', ''];
    const testYellows = [[], [], [], ['t'], ['y']];
    const testGrays = ['t', 'a', 'r', 'e', 's', 'f', 'o'];
    
    // Test words that should be eliminated
    const testWords = ['burnt', 'party', 'dirty', 'forty'];
    
    console.log('Testing burnt case...');
    console.log('Greens:', testGreens);
    console.log('Yellows:', testYellows);
    console.log('Grays:', testGrays);
    
    for (const word of testWords) {
        const isValid = get_valid_guesses([word], testGreens, testYellows, testGrays).length > 0;
        console.log(`${word}: ${isValid ? 'VALID' : 'ELIMINATED'}`);
    }
}

// Event listeners
document.getElementById('new-game-btn').addEventListener('click', startNewGame);
document.getElementById('reset-btn').addEventListener('click', resetGame);
document.getElementById('submit-feedback-btn').addEventListener('click', submitFeedback);

// Allow Enter key to submit feedback
document.getElementById('feedback-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        submitFeedback();
    }
});

// Real-time feedback validation
document.getElementById('feedback-input').addEventListener('input', function(e) {
    const value = e.target.value.toLowerCase();
    const submitBtn = document.getElementById('submit-feedback-btn');
    
    // Only allow valid characters
    e.target.value = value.replace(/[^gyb]/g, '');
    
    // Enable/disable submit button
    submitBtn.disabled = e.target.value.length !== 5;
    
    // Show visual preview if valid
    if (e.target.value.length === 5 && gameState.currentGuess) {
        renderVisualFeedback(e.target.value, gameState.currentGuess);
    } else {
        document.getElementById('visual-feedback').innerHTML = '';
    }
});
