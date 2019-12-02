import * as firebase from 'firebase/app'
import 'firebase/auth'
import 'firebase/database'
import { IConnectionProvider, Connector, ISavedLoginProvider, ISavedLoginState, IEventsPublisher, ICredential, IUserState, IConnection } from 'canasta-core'

export interface IFirebaseConnection {
    firebase_app: firebase.app.App | null,
    firebase_auth: firebase.auth.Auth | null,
    firebase_database: firebase.database.Database | null,
    functions_url: string | null,
}

export interface IFirebaseConnectorOptions {
    local_storage_item_key?: string
}

const NULL_CONNECTION: IFirebaseConnection = {
    firebase_app: null,
    firebase_auth: null,
    firebase_database: null,
    functions_url: null,
}

export class FirebaseConnector extends Connector {
    constructor (eventsPublisher: IEventsPublisher, options?: IFirebaseConnectorOptions) {
        const firebaseConnectorProvider = new FirebaseConnectorProvider()
        const windowLocalStorageProvider = new WindowLocalStorageProvider()
        super(firebaseConnectorProvider, eventsPublisher, windowLocalStorageProvider, options)
    }
}

export class FirebaseConnectorProvider implements IConnectionProvider {

    constructor() {}

    async openConnection(org_token: string): Promise<IConnection> {
        return token2connection(org_token)
    }

    async getRedirectResult(connection: IConnection): Promise<{ user: IUserState; credential: ICredential; } | void> {
        const { firebase_auth } = <IFirebaseConnection>connection
        if (firebase_auth) {
            const result = await firebase_auth.getRedirectResult()
            if (result && result.user && result.credential) {
                return { user: result.user, credential: result.credential }
            }
        }
    }

    async signInWithCredential(connection: IConnection, credential: ICredential): Promise<IUserState | void> {
        const { firebase_auth } = <IFirebaseConnection>connection
        if (firebase_auth == null) {
            throw new Error('Missing required argument, `connection`')
        }

        const firebaseCredential = <{ idToken?: string }>credential
        if (firebaseCredential == null) {``
            throw new Error('Missing required argument, `credential`')
        }

        const googleCredential = firebase.auth.GoogleAuthProvider.credential(firebaseCredential.idToken)
        const userCredential = await firebase_auth.signInAndRetrieveDataWithCredential(googleCredential)

        if (userCredential && userCredential.user) return userCredential.user
    }

    async signInWithRedirect(connection: {}): Promise<{ user: IUserState; credential: ICredential; } | void> {
        const { firebase_auth } = <IFirebaseConnection>connection
        if (firebase_auth == null) {
            throw new Error('Missing required argument, `connection`')
        }

        const provider = new firebase.auth.GoogleAuthProvider()
        await firebase_auth.signInWithRedirect(provider)
    }

    async signOut(connection: {}): Promise<void> {
        const { firebase_auth, firebase_app } = <IFirebaseConnection>connection
        if (firebase_auth) {
            await firebase_auth.signOut()
        }

        if (firebase_app) {
            await firebase_app.delete()
        }
    }

}

class WindowLocalStorageProvider implements ISavedLoginProvider {
    async set_saved_login(key: any, login: ISavedLoginState): Promise<void> {
        if (login) {
            window.localStorage.setItem(key, JSON.stringify(login))
        }
        else {
            window.localStorage.removeItem(key)
        }
    }
    async get_saved_login(key: any): Promise<ISavedLoginState | null> {
        const json = window.localStorage.getItem(key)
        return json && JSON.parse(json)
    }
}

async function token2connection(org_token: string): Promise<IFirebaseConnection> {
    if (!org_token) return NULL_CONNECTION

    const token_decoded = atob(org_token).split('/')
    const org = token_decoded[0]
    const region = token_decoded[3] || 'us-central1'
    const config = {
        apiKey: token_decoded[1],
        authDomain: `${org}.firebaseapp.com`,
        databaseURL: `https://${org}.firebaseio.com`,
        projectId: `${org}`,
        storageBucket: `${org}.appspot.com`,
        messagingSenderId: token_decoded[2] // may be undefined
    }

    let firebase_app: firebase.app.App | undefined

    try {
        firebase_app = firebase.initializeApp(config)
        const firebase_auth = firebase_app.auth()
        const firebase_database = firebase_app.database()
        const functions_url = `https://${region}-${org}.cloudfunctions.net`
        return { firebase_app, firebase_auth, firebase_database, functions_url }
    } catch(e) {
        if (firebase_app) {
            await firebase_app.delete()
        }
        throw e
    }
}

