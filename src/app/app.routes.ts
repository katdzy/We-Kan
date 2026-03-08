import { Routes } from '@angular/router';
import { Profile } from './profile/profile';
import { App } from './app';

export const routes: Routes = [
    {path: '', component: App},
    {path: 'profile', component: Profile},
    {path: '**', redirectTo: ''}
];
