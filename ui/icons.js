const paths={
 wheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m3.5 9 6.6 2M20.5 9l-6.6 2M12 14v6.5"/>',
 garage:'<path d="M3 20V8l9-5 9 5v12M6 20V10h12v10M6 13h12M6 16h12"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
 hub:'<path d="M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
 flag:'<path d="M4 21V3m0 1c5-4 10 4 16-1v11c-6 5-11-3-16 1"/><path d="m9 4 0 9m6-7v9M5 9c5-4 10 4 15-1"/>',
 timer:'<circle cx="12" cy="14" r="7.5"/><path d="M12 10v4l3 1M9 2h6m-3 0v4m6 2 2-2"/>',
 siren:'<path d="M6 17v-5a6 6 0 0 1 12 0v5m-14 0h16v4H4zM12 1v2M3 5l2 1m14 0 2-1"/>',
 bolt:'<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>', 
 settings:'<path d="m10 3-.5 2-2 .9-2-.6-2 3.4L5 10.2v2.7l-1.5 1.5 2 3.5 2-.5 2 .9L10 21h4l.5-2.6 2-.9 2 .5 2-3.5-1.5-1.5v-2.7l1.5-1.5-2-3.4-2 .6-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',
 user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
 play:'<path fill="currentColor" stroke="none" d="M6 3.5 21 12 6 20.5z"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',
 exit:'<path d="M13 5H5v14h8m-2-7h10m-4-4 4 4-4 4"/>',return:'<path d="M20 5v9H4m4-4-4 4 4 4"/>',
 control:'<path d="M7 7h10c3 0 5 4 5 10 0 2-2 3-4 1l-3-3H9l-3 3c-2 2-4 1-4-1 0-6 2-10 5-10zM5 11h5m-2.5-2.5v5m8-2.5h.1m2 2h.1"/>',
 volume:'<path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
 mute:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6"/>',
 route:'<circle cx="5" cy="18" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 18h8a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h8"/>',
 car:'<path d="m3 14 2-1 3-5h7l4 4 2 1v4h-2m-4 0H9m-4 0H3z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
 cross:'<path d="m6 6 12 12M18 6 6 18"/>',cash:'<path d="m3 8 11-5 7 4-12 5zM3 12l6 4 12-5M3 16l6 4 12-5"/>',
 check:'<path d="m4 12 5 5L20 6"/>', radio:'<path d="M3 8v8m4-11v14m5-17v20m5-16v12m4-9v6"/>',
 layers:'<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
 pause:'<path d="M8 5v14m8-14v14"/>',compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',
 trophy:'<path d="M7 3h10v5c0 7-10 7-10 0zM7 5H3v3c0 3 2 4 5 4m9-7h4v3c0 3-2 4-5 4m-4 2v5m-4 2h8"/>',
 gauge:'<path d="M3 18a10 10 0 1 1 18 0zM12 14l5-6"/><circle cx="12" cy="14" r="1.5"/>'
};
export const icon=(name,size=20)=>'<svg aria-hidden="true" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||'')+'</svg>';
export const logo='<svg class="emblem" viewBox="0 0 66 46" aria-hidden="true"><path fill="#ff7338" d="M0 6h12l10 25L43 6h13L19 46z"/><path fill="#ff7338" d="M16 6h9l4 12-7 8zM46 0h11l-4 4H43zM55 7h11L36 42H25z"/></svg>';
