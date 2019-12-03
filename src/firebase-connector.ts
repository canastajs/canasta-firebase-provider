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

class UserObserver implements firebase.Observer<firebase.User> {
    private _resolvers: ((value?: { user: IUserState; credential: ICredential; } | void) => void)[] = []
    private _rejecters: ((reason?: Error) => void | undefined)[] = []
    private _unsubscribe?: firebase.Unsubscribe
    private _user?: firebase.User | null
    private _token?: string | null
    private _auth_error?: Error
    private _is_completed: boolean = false

    constructor(auth: firebase.auth.Auth) {
        this._unsubscribe = this._unsubscribe = auth.onAuthStateChanged(this)
    }

    complete() { }

    next(user: firebase.User | null) { 
        if (user == null) {
            this._user = null
            this._token = null
            this._resolveAll(user)
        } else {
            user.getIdToken(true) // force token refresh
            .then((token) => {
                this._token = token
                this._user = user
                this._resolveAll(user)
            })
            .catch((error) => {
                console.log('user.getIdToken error:', error)
                this._auth_error = error
                this._rejectAll(error)
            })
        }
    }

    resolveUser(resolve?: (value?: { user: IUserState; credential: ICredential; } | void) => void, reject?: (reason?: Error) => void) {
        if (this._is_completed) {
            reject && reject(new Error("onAuthStateChanged observer has been closed"))
        }
        else if (this._auth_error) {
            reject && reject(this._auth_error)
        }
        else if ((this._user === undefined) || (this._token === undefined)) {
            resolve && this._resolvers.push(resolve)
            reject && this._rejecters.push(reject)
        }
        else {
            resolve && (this._user ? resolve(UserObserver._toUserCredential(this._user)) : resolve())
        }
    }

    error(error: Error) { 
        console.log('auth error', error)
        this._auth_error = error 
        this._rejectAll(error)
    }

    close() {
        this._is_completed = true 
        if (this._unsubscribe) { 
            this._unsubscribe()
            this._unsubscribe = undefined
        }
        this._rejectAll(new Error("onAuthStateChanged observer has been closed"))
    }

    private static _toUserCredential (user: firebase.User): { user: IUserState, credential: ICredential } {
        return { user, credential: { email: user.email } }
    }

    private _resolveAll(user: firebase.User | null) {
        if (this._user) {
            let userCredential = UserObserver._toUserCredential(this._user)
            this._resolvers.forEach((resolve) => resolve(userCredential))
        }
        else {
            this._resolvers.forEach((resolve) => resolve())
        }
        this._resolvers = []
        this._rejecters = []
    }

    private _rejectAll(error: Error) {
        this._rejecters.forEach((reject) => reject && reject(error))
        this._resolvers = []
        this._rejecters = []
    }
    
}

export class FirebaseConnectorProvider implements IConnectionProvider {

    private _userObserver?: UserObserver

    constructor() {}

    async openConnection(org_token: string): Promise<IConnection> {
        return token2connection(org_token)
    }

    async getRedirectResult(connection: IConnection): Promise<{ user: IUserState; credential: ICredential; } | void> {
        const { firebase_auth } = <IFirebaseConnection>connection
        if (firebase_auth) {
            // const result = await firebase_auth.getRedirectResult()
            // if (result && result.user && result.credential) {
            //     return { user: result.user, credential: result.credential }
            // }
            if (!this._userObserver) { this._userObserver = new UserObserver(firebase_auth) }
            return new Promise((resolve, reject) => 
                this._userObserver ? this._userObserver.resolveUser(resolve, reject) 
                : reject(new Error("FirebaseConnectorProvider _userObserver not initialized")))
        }
    }

    async signInWithCredential(connection: IConnection, credential: ICredential): Promise<IUserState | void> {
        const { firebase_auth } = <IFirebaseConnection>connection
        if (firebase_auth == null) {
            throw new Error('Missing required argument, `connection`')
        }

        if (!firebase_auth.currentUser) return

        const email = credential && (<any>credential).email
        if (!email) return
        if (firebase_auth.currentUser.email !== email) return

        return firebase_auth.currentUser      

        // const firebaseCredential = <{ idToken?: string }>credential
        // if (firebaseCredential == null) {``
        //     throw new Error('Missing required argument, `credential`')
        // }

        // const googleCredential = firebase.auth.GoogleAuthProvider.credential(firebaseCredential.idToken)
        // const userCredential = await firebase_auth.signInWithCredential(googleCredential)

        // if (userCredential && userCredential.user) return userCredential.user
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
        if (this._userObserver) {
            this._userObserver.close()
            this._userObserver = undefined
        }
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
            window.localStorage.setItem(key, JSON.stringify({
                org_token: login.org_token,
                credential: JSON.stringify(login.credential) // will call custom toJSON()
            }))
        }
        else {
            window.localStorage.removeItem(key)
        }
    }
    async get_saved_login(key: any): Promise<ISavedLoginState | null> {
        const json = window.localStorage.getItem(key)
        if (!json) return null
        const temp = JSON.parse(json)
        return {
            org_token: temp.org_token,
            credential: firebase.auth.AuthCredential.fromJSON(temp.credential)
        }
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

