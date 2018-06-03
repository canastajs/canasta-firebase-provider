import * as firebase from 'firebase/app'
import 'firebase/auth'
import { ModuleAction, IModuleActionProvider, IModuleActionResponse } from 'canasta-core' // **NPM**

export class FirebaseModuleAction extends ModuleAction {
    constructor(firebase_auth: firebase.auth.Auth, functions_url: string) {
        const moduleActionProvider = new FirebaseModuleActionProvider(firebase_auth, functions_url)
        super(moduleActionProvider)
    }
}

export class FirebaseModuleActionProvider implements IModuleActionProvider {
    private _functions_url: string;
    private _firebase_auth: firebase.auth.Auth;

    constructor(firebase_auth: firebase.auth.Auth, functions_url: string) {
        this._firebase_auth = firebase_auth
        this._functions_url = functions_url
    }

    async invoke_module_action(function_name: string, module: string, action: string, payload?: {} | string): Promise<IModuleActionResponse> {

        const headers: HeadersInit = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        if (this._firebase_auth.currentUser) {
            const token = await this._firebase_auth.currentUser.getIdToken()
            headers['Authorization'] = 'Bearer ' + token
        }

        const body = (typeof(payload) === 'string') ? payload
            : JSON.stringify(payload)

        const init: RequestInit = {
            method: 'post',
            mode: 'cors',
            cache: 'no-store',
            headers,
            body
        }

        const url = `${this._functions_url}/${function_name}/${module}/${action}`

        const response = await fetch(url, init)

        const responsePayload = await response.json()
        if (!response.ok && !responsePayload.error) {
            responsePayload.error = { message: 'Unsuccessful', status: response.status }
        }

        return { ok: response.ok, payload: responsePayload }
    }

}