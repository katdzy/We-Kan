import { Routes } from '@angular/router';
import { Profile } from './profile/profile';
import { Dashboard } from './dashboard/dashboard';
import { App } from './app';

export const routes: Routes = [
    {path: '', component: Dashboard, pathMatch: 'full'},
    {path: 'boards', component: App},
    {path: 'profile', component: Profile},
    {path: '**', redirectTo: ''}
];
