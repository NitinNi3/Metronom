import io from 'socket.io-client';
// const sockets = io('http://localhost:3001', { autoConnect: true, forceNew: true });
// const sockets = io('http://192.168.1.3:3001');
const sockets = io('https://a693-182-57-37-117.in.ngrok.io');
// const sockets = io('/');
export default sockets;
