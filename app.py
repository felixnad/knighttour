from flask import Flask, render_template, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room
import logging
import os

# Configuration du logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, logger=True, engineio_logger=True)

# Stockage des parties en cours
games = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/faq')
def faq():
    return render_template('faq.html')

@app.route('/robots.txt')
def robots():
    return send_from_directory(app.static_folder, 'robots.txt')

@app.route('/sitemap.xml')
def sitemap():
    return send_from_directory('templates', 'sitemap.xml', mimetype='application/xml')

@socketio.on('connect')
def handle_connect():
    logger.info(f'Client connecté: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f'Client déconnecté: {request.sid}')

@socketio.on('create_game')
def create_game(data=None):
    logger.info(f'Création d\'une partie par {request.sid}')
    # Supprime toutes les anciennes parties de ce joueur
    to_delete = []
    for gid, game in games.items():
        if request.sid in game['players']:
            to_delete.append(gid)
    for gid in to_delete:
        del games[gid]
    # Taille de l'échiquier
    size = 8
    if data and 'size' in data:
        try:
            size = int(data['size'])
            if size < 4 or size > 8:
                size = 8
        except Exception:
            size = 8
    # Crée une nouvelle partie
    game_id = str(len(games) + 1)
    join_room(game_id)
    games[game_id] = {
        'board': [[0 for _ in range(size)] for _ in range(size)],
        'current_player': request.sid,
        'players': [request.sid],
        'moves': [],
        'size': size
    }
    logger.info(f'Partie {game_id} créée (taille {size})')
    emit('game_created', {'game_id': game_id})
    emit('game_start', {
        'board': games[game_id]['board'],
        'is_my_turn': True,
        'size': size
    }, room=request.sid)

@socketio.on('make_move')
def make_move(data):
    game_id = None
    for gid, game in games.items():
        if request.sid in game['players']:
            game_id = gid
            break
    if not game_id:
        emit('error', {'message': 'Partie introuvable'})
        return
    row = data['row']
    col = data['col']
    logger.info(f'Tentative de mouvement dans la partie {game_id} par {request.sid}: ({row}, {col})')
    if not is_valid_move(games[game_id]['board'], row, col):
        logger.warning(f'Mouvement invalide: ({row}, {col})')
        emit('error', {'message': 'Mouvement invalide'})
        return
    games[game_id]['board'][row][col] = len(games[game_id]['moves']) + 1
    games[game_id]['moves'].append((row, col))
    logger.info(f'Mouvement effectué dans la partie {game_id}')
    emit('move_made', {
        'board': games[game_id]['board'],
        'is_my_turn': True
    }, room=request.sid)

@socketio.on('undo_move')
def undo_move():
    game_id = None
    for gid, game in games.items():
        if request.sid in game['players']:
            game_id = gid
            break
    if not game_id:
        emit('error', {'message': 'Partie introuvable'})
        return
    if not games[game_id]['moves']:
        emit('error', {'message': 'Aucun coup à annuler'})
        return
    last_row, last_col = games[game_id]['moves'].pop()
    games[game_id]['board'][last_row][last_col] = 0
    emit('undo_done', {
        'board': games[game_id]['board'],
        'is_my_turn': True
    }, room=request.sid)

def is_valid_move(board, row, col):
    size = len(board)
    if not (0 <= row < size and 0 <= col < size):
        return False
    if board[row][col] != 0:
        return False
    return True

if __name__ == '__main__':
    import eventlet
    import eventlet.wsgi
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)