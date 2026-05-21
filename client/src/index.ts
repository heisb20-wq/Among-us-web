import { NetworkManager } from './network/NetworkManager';
const network = new NetworkManager();
network.connect('http://localhost:3000');
export { network };
