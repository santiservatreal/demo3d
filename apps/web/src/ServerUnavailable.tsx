import { CloudOff,RefreshCw } from 'lucide-react';
import { ApiError } from './api';
import { Button } from './ui';

export function ServerUnavailable({error,retry}:{error:unknown;retry:()=>void}){
 const missing=error instanceof ApiError&&error.code==='BACKEND_NOT_CONFIGURED';
 return <main className="bv-auth-shell"><section className="bv-login-card bv-server-unavailable" role="alert">
  <CloudOff size={30}/><h1>{missing?'Falta conectar el servidor':'No podemos conectar con BirdView'}</h1>
  <p>{missing?'Esta publicación muestra la interfaz, pero aún necesita el servidor que guarda los datos y ejecuta las consultas.':'No se ha podido contactar con el servidor de la aplicación. Comprueba su disponibilidad y vuelve a intentarlo.'}</p>
  <Button onClick={retry}><RefreshCw size={15}/>Volver a comprobar</Button>
  <Button variant="secondary" onClick={()=>window.location.assign('/app/?demo=local')}>Entrar en la demo gratuita</Button>
  <details><summary>Información para configurar esta publicación</summary><p>La versión de Vercel necesita la API de BirdView publicada y la variable <code>BIRDVIEW_API_ORIGIN</code> con su origen HTTPS. Ese servidor necesita PostgreSQL, Redis y el worker. Publicar solo la interfaz deja pendiente esta conexión.</p><p>Si utilizas Docker, abre <code>/app/</code> en el puerto <code>8080</code> de esa instalación.</p></details>
  <a className="bv-small-link" href="/">Abrir la ciudad anterior ↗</a>
 </section></main>;
}
