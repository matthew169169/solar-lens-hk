import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const runtimeModules=process.env.RUNTIME_NODE_MODULES;
if(!runtimeModules)throw new Error('Set RUNTIME_NODE_MODULES to the installed Artifact Tool runtime.');
const runtimeRequire=createRequire(path.join(runtimeModules,'__solar_deck__.cjs'));
const {Presentation,PresentationFile}=await import(pathToFileURL(runtimeRequire.resolve('@oai/artifact-tool')).href);

const repo=path.resolve(process.env.SOLAR_REPO || process.cwd());
const workspaceDir=path.resolve(process.env.SOLAR_WORKSPACE || path.dirname(repo));
const build=path.resolve(process.env.SOLAR_DECK_BUILD || path.join(workspaceDir,'presentation-work/build'));
await fs.mkdir(build,{recursive:true});
const assets = path.join(repo,'docs/presentations/assets');
const SKILL_DIR=process.env.PRESENTATIONS_SKILL_DIR;
if(!SKILL_DIR)throw new Error('Set PRESENTATIONS_SKILL_DIR to the installed presentations skill.');
const RUNTIME_PYTHON=process.env.RUNTIME_PYTHON;
if(!RUNTIME_PYTHON)throw new Error('Set RUNTIME_PYTHON to the bundled Python executable.');
const { finalizePresentation, applyPresentationChartFont } = await import(pathToFileURL(path.join(SKILL_DIR,'container_tools/artifact_tool_utils.mjs')).href);
const {summary} = await import(pathToFileURL(path.join(repo,'src/geometry.js')).href);
const manifest = JSON.parse(await fs.readFile(path.join(repo,'public/demo/manifest.json')));
const settings={tilt:'0',moduleArea:'2.2'};
const data=[];
for(const p of manifest.pairs){const d=JSON.parse(await fs.readFile(path.join(repo,'public',p.path)));data.push({...p,old:summary(d.images[0],settings),now:summary(d.images[1],settings)});}
const totals={oldCount:0,newCount:0,oldPlan:0,newPlan:0};
for(const p of data){totals.oldCount+=p.old.count;totals.newCount+=p.now.count;totals.oldPlan+=p.old.plan;totals.newPlan+=p.now.plan;}
await fs.writeFile(path.join(build,'study-data.json'),JSON.stringify({assumptions:settings,totals,sites:data},null,2));
const nf=(v,d=0)=>new Intl.NumberFormat('en',{maximumFractionDigits:d,minimumFractionDigits:d}).format(v);
const P=Presentation.create({slideSize:{width:1280,height:720}});
const C={bg:'#F5F6F1',forest:'#1C382D',green:'#295B47',muted:'#627367',gold:'#D6B570',white:'#FFFFFF',line:'#DBE2D7'};
const FONT='Arial';
const BASE='https://github.com/matthew169169/solar-lens-hk/blob/5148496/';
const SITE='https://matthew169169.github.io/solar-lens-hk/';
function text(s,t,x,y,w,h,size=28,color=C.forest,bold=false){const q=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});q.text=t;q.text.style={typeface:FONT,fontSize:size,color,bold,insets:0,verticalAlignment:'top',autoFit:'none',wrap:'square'};return q;}
function note(s,t,files=[]){s.speakerNotes.text=t+'\n\nSources: '+files.map(f=>f.startsWith('http')?f:BASE+f).join('\n');}
function slide(title,sub=''){const s=P.slides.add();s.background.fill=C.bg;text(s,title,64,48,1152,66,44,C.forest,true);if(sub)text(s,sub,64,119,1152,60,24,C.muted);text(s,`${String(P.slides.items.length).padStart(2,'0')} / 20`,1140,677,78,22,17,C.muted);return s;}
async function img(s,p,x,y,w,h,fit='contain',alt=''){const bytes=await fs.readFile(p);return s.images.add({blob:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),contentType:/\.jpe?g$/i.test(p)?'image/jpeg':'image/png',position:{left:x,top:y,width:w,height:h},fit,alt});}
function row(s,head,body,y,x=64,w=1100){text(s,head,x,y,w,36,29,C.green,true);text(s,body,x,y+43,w,75,26,C.forest);}
function footer(s,t){text(s,t,64,620,1140,46,21,C.muted);}
function table(s,values,x,y,w,h,widths,font=24){const tb=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});tb.borders.assign({fill:C.line,width:.6,style:'solid'});tb.cells.block({row:0,column:0,rowCount:values.length,columnCount:values[0].length}).assign({textStyle:{typeface:FONT,fontSize:font,color:C.forest},margins:{top:6,bottom:6,left:10,right:10},anchor:'center'});for(let r=0;r<values.length;r++)for(let c=0;c<values[r].length;c++){const cell=tb.getCell(r,c);cell.fill=r===0?C.forest:(r%2?C.white:C.bg);cell.text.style={typeface:FONT,fontSize:r===0?font-1:font,color:r===0?C.white:C.forest,bold:r===0,verticalAlignment:'middle',insets:{left:10,right:10,top:6,bottom:6}};}return tb;}

// 01
{
 const s=P.slides.add();s.background.fill=C.forest;
 await img(s,path.join(repo,'research/analysis/haeco_detail.jpg'),590,0,690,720,'cover','Supplied HAECO aerial photograph showing rooftop solar arrays');
 text(s,'SOLAR LENS HK',64,74,470,36,25,C.gold,true);
 text(s,'Measuring\nsolar change',64,207,500,200,69,C.white,true);
 text(s,'Aerial-photo comparison,\npanel estimates, areas and locations',64,436,470,100,28,'#DDE7DC');
 text(s,'PROJECT & FUNCTION GUIDE\nVersion 2.1 · 3 November 2026',64,618,480,58,20,'#DDE7DC');
 note(s,'Solar Lens HK is a working browser application for comparing solar-covered regions in aerial photographs. This presentation explains the problem, dataset, user functions, implementation and limits. The aerial photograph is a supplied study image; no installation count is inferred from the cover.', ['README.md','research/analysis/haeco_detail.jpg']);
}
// 02
{
 const s=slide('The project’s three outputs','Compare the same place at two dates and keep the evidence for each result.');
 row(s,'01  Panel count','Estimate physical modules from area, or enter a verified manual count.',204,64,560);
 row(s,'02  Solar-panel area','Measure the mapped footprint and calculate panel-face area using tilt.',346,64,560);
 row(s,'03  Panel locations','Locate outlined solar regions on a map and export WGS84 coordinates.',488,64,560);
 await img(s,path.join(repo,'public/demo/2025lamma.jpg'),700,195,516,402,'cover','Newer supplied Lamma Island aerial preview');
 note(s,'The model segments solar regions or arrays, rather than identifying every physical module. Automated panel counts are therefore area-based estimates. Counts, footprint and face area are reported separately. Locations derive from the photo georeference or a valid user-supplied anchor. The study does not cover all of Hong Kong.',['README.md','src/geometry.js','public/demo/lamma.json']);
}
// 03
{
 const s=slide('The supplied study','11 places · 22 original TIFFs · older photos from 2016–2017 and newer photos from 2025–2026');
 const list=data.map(p=>[p.title.replace(' · Airport',' / Airport'),`${p.olderYear} → ${p.newerYear}`]);
 table(s,[['Place','Photo years'],...list.slice(0,6)],64,210,555,357,[355,200],25);
 table(s,[['Place','Photo years'],...list.slice(6)],661,210,555,306,[355,200],25);
 footer(s,'Dates come from filenames. Original large TIFFs stay local; the website includes reduced previews and saved outlines.');
 note(s,'The manifest identifies all 11 supplied photo pairs. These are approximately decade-apart comparisons, not a single uniform ten-year interval. The README reports 750 × 600 m per newer footprint, 4.95 km² combined non-overlapping newer coverage. The old HAECO and Lamma imagery uses approximate image registration to the newer reference.',['public/demo/manifest.json','README.md']);
}
// 04
{
 const s=slide('The user workflow','The same workflow supports supplied study data and newly uploaded photographs.');
 row(s,'1  Add the evidence','Upload one current photo, or an older/newer pair. Name the study and check the dates.',196);
 row(s,'2  Set the measurements','Confirm scale and location. Enter tilt and physical module area where known.',300);
 row(s,'3  Detect and review','Auto-scan uploads, or detect the selected filename. Review outlines and trace missed areas.',404);
 row(s,'4  Save and export','Reopen saved work or export measurements, geographic outlines and project files.',508);
 note(s,'The optional How it works → Load HAECO example action loads two small original HAECO TIFF crops and runs live browser inference. Supplied full-place studies already include saved candidate results. Saved photos can be rescanned at preview resolution; reattach originals for full detail. New uploads do not leave the browser.',['README.md','src/main.js']);
}
// 05
{
 const s=slide('Photo input and calibration','GeoTIFF, JPEG, PNG and WebP are supported. Measurement needs reliable image scale.');
 row(s,'GeoTIFF input','Read embedded pixel spacing and map coordinates automatically.',213,64,535);
 row(s,'Ordinary photographs','Enter known metres per pixel for area; add a grid or latitude/longitude anchor for location.',354,64,535);
 row(s,'Large original files','Read bounded image windows, show loading progress and retain a reduced preview.',509,64,535);
 await img(s,path.join(assets,'calibration.png'),648,193,568,400,'contain','Scale and location calibration dialog');
 note(s,'Calibration accepts scale-only, Hong Kong 1980 Grid (EPSG:2326), a WGS84 latitude/longitude anchor converted to local metric UTM, or Web Mercator. Manual calibration assumes a north-up orthophoto. Without scale, area remains unknown; scale-only calibration does not invent coordinates. Original TIFF reads use native-pixel-bounded bands to limit allocation before resampling.',['src/imagery.js','src/raster-bands.js','src/calibration.js','README.md']);
}
// 06
{
 const s=slide('How detection works','A pretrained YOLOv8s segmentation model runs locally through ONNX Runtime Web.');
 await img(s,path.join(assets,'detection.png'),64,199,452,452,'contain','HAECO crop with solar-array segmentation outlines');
 row(s,'Read and tile','Decode windows of the original photo; prepare 640 × 640 pixel model inputs.',207,572,635);
 row(s,'Segment solar regions','Run inference in a Web Worker, with confidence and working-resolution controls.',346,572,635);
 row(s,'Merge the outlines','Use tile-core ownership and polygon union to remove overlapping mask area.',493,572,635);
 note(s,'The deployed model is finloop/yolov8s-seg-solar-panels. Browser inference uses CPU/WASM with one thread. Tiles use a 512-pixel core and 64-pixel margin, followed by mask postprocessing, clipping to core ownership, union and small-region filtering. Interior holes are retained. Cancel terminates the worker; results are committed only when the requested run finishes, preserving previous results on cancellation. A model confidence score is not a calibrated accuracy percentage.',['src/detector.js','src/inference.worker.js','src/postprocess.js','public/models/manifest.json','README.md',SITE]);
}
// 07
{
 const s=slide('Area and count calculations','The app keeps measured geometry, assumptions and manually entered counts separate.');
 text(s,'Footprint = net polygon area × mapped pixel area',64,213,1140,60,35,C.green,true);
 text(s,'Panel-face area = footprint ÷ cos(tilt)',64,299,1140,60,35,C.green,true);
 text(s,'Estimated panels = round(face area ÷ module area)',64,385,1140,60,35,C.green,true);
 text(s,'Illustrative example: 100 m² footprint, 30° tilt and 2.2 m² per module\n→ 115.5 m² panel-face area → approximately 52 panels',64,485,1140,88,28);
 footer(s,'Default assumptions: 0° tilt and 2.2 m²/module. Clearing unknown tilt leaves face area and estimates unavailable.');
 note(s,'Net polygon area subtracts interior holes and merged masks avoid overlapping area. The affine transform determinant gives metric area per pixel; Web Mercator uses a latitude correction. Estimates are rounded per included region, then summed. A manual count replaces the area estimate for that region. Each region may override study tilt and module area. The calculation example is illustrative, not a site measurement.',['src/geometry.js','src/main.js','README.md']);
}
// 08
{
 const s=slide('Comparison dashboard','Older/newer results, matching-coverage checks, linked photo navigation and editable measurement settings.');
 await img(s,path.join(assets,'dashboard.png'),64,190,944,472,'contain','Live Solar Lens HK comparison dashboard');
 text(s,'Current filename\nScan scope\nAuto-detect\nPhoto results',1028,218,188,220,25,C.green,true);
 text(s,'≈ = estimated\nReview before use',1028,485,188,130,23,C.muted);
 note(s,'The screenshot shows current-photo scan controls after importing a separate Shek O photo. It illustrates explicit filename targeting, automatic detection and source-resolution disclosure. It is not the full-place supplied-study baseline. The optional HAECO loader is under How it works and never acts as a fallback for ordinary scans. Side-by-side photos support fit, zoom, pan, outline toggling and linked views when geographic coverage matches. Change metrics are withheld when comparable coverage cannot be verified. Matching boundaries do not prove perfect local registration.',['research/analysis/gui-v2-verification.md','src/main.js',SITE]);
}
// 09
{
 const s=slide('Review and correct the findings','A reviewable inventory connects every outlined solar region to its measurements.');
 await img(s,path.join(assets,'review.png'),64,187,692,440,'contain','Solar-area review dialog showing a close-up, count and assumption fields');
 row(s,'Inspect','Open an outline or table row for a close-up and location.',204,805,410);
 row(s,'Correct','Enter a count, optional tilt/module size and a review note.',350,805,410);
 row(s,'Complete','Exclude false positives, restore them or trace missed areas.',498,805,410);
 note(s,'Review status and manual counts persist in the local project. Counts refer to physical modules, not divisions between solar cells. Manually traced additions subtract overlapping included outlines. The table supports older/newer periods, ID search, review/exclusion filters, largest-area sorting and 50-row pagination. Turn off Auto-detect new uploads before reattaching an original if you want to preserve review work; a new scan replaces candidate outlines. Automated detection may still miss panels; reviewers must inspect negative areas too.',['src/main.js','README.md']);
}
// 10
{
 const s=slide('The complete data library','All supplied studies and saved personal comparisons are searchable in one place.');
 await img(s,path.join(repo,'research/analysis/gui-v2-library.png'),64,190,944,472,'contain','Solar Lens HK library showing all eleven supplied studies');
 text(s,'Search by place,\nfile or year\n\nFilter data source\n\nSort footprints\n\nReopen reviews',1044,215,172,390,24,C.green);
 note(s,'The library overlays saved review records on the supplied studies and also lists personal uploaded projects. It includes cards, pooled totals and a complete older/newer measurement table. Every saved project retains its own tilt/module assumptions. Library exports follow the active search/source filter. Overlapping personal studies can be counted more than once in pooled totals; these totals are not a territory-wide solar inventory.',['src/library.js','src/main.js','README.md']);
}
// 11
{
 const s=slide('Panel locations and geographic export','Map either the current comparison or all library studies, with older/newer/both-date controls.');
 await img(s,path.join(assets,'map.png'),64,184,860,462,'contain','Mapped HAECO candidate solar outlines on OpenStreetMap');
 text(s,'Click an outline\nfor measurements\n\nWGS84 coordinates\nand polygon export\n\nUnlocated regions\nare omitted from maps',966,223,250,340,27,C.green);
 note(s,'GeoJSON contains WGS84 polygons, study identity, period, filename/date, panel count and its method, plan and face area, assumptions and review information. The UI also lists a representative longitude/latitude for each region. Coordinate accuracy inherits the aerial photo and calibration; an anchor does not establish survey accuracy. OpenStreetMap tiles require internet and disclose the approximate map view to the provider. Map screenshot attribution: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright .',['src/geometry.js','src/library.js','src/main.js','https://www.openstreetmap.org/copyright']);
}
// 12
{
 const s=slide('Saving, reopening and exports','Autosave supports ongoing review. Downloaded files support backup, analysis and GIS work.');
 table(s,[['Format','Purpose','Contents'],['CSV','Analysis in a spreadsheet','Counts, areas, coordinates, assumptions and review notes'],['GeoJSON','Mapping and GIS','WGS84 polygons with measurements and provenance'],['Project JSON','Reopen and continue','Previews, outlines, settings and reviewed values']],64,205,1152,285,[180,285,687],25);
 text(s,'Library exports: filtered summary CSV and all located outlines\nLocal IndexedDB: saved comparisons on this browser and device\nOriginal high-resolution photographs: reattach for full-resolution detection',64,528,1152,108,27);
 note(s,'Project exports do not contain original giant TIFFs. Saved projects can rerun inference on their own preview; the UI and run metadata disclose reduced-preview analysis. Reattach originals for full detail. Analyzed regions without coordinates remain available in CSV/project files but are skipped from GeoJSON, with omitted IDs disclosed. CSV cells are escaped to prevent formula injection. Export project JSON for backup or transfer; browser storage is not an account-based cloud backup.',['src/main.js','src/geometry.js','README.md']);
}
// 13
{
 const s=slide('Architecture and data privacy','Static hosting serves the app; the visitor’s browser performs analysis and stores personal work.');
 table(s,[['Component','Role'],['Vite + JavaScript + CSS','Responsive interface and application state'],['GeoTIFF + proj4','Read image windows and transform coordinates'],['Web Worker + ONNX Runtime Web','Run model inference without a server API'],['Polygon processing + Leaflet','Merge geometry and show mapped outlines'],['IndexedDB + downloads','Save personal projects and export results']],64,202,1152,342,[460,692],25);
 text(s,'Published: approved previews, saved study results and sample crops\nLocal only: new uploads, review edits and original giant TIFFs',64,581,1152,69,26,C.green,true);
 note(s,'GitHub Pages is the primary public host, with a separate private Sites mirror. No upload/analytics endpoint or API key is required. The browser downloads the model on demand. Fonts are fetched from Google Fonts and map tiles from OpenStreetMap; ordinary host asset requests remain visible to the provider. Application source is AGPL-3.0-or-later; third-party code, model and supplied imagery retain their applicable terms.',['package.json','src/main.js','src/detector.js','README.md','THIRD_PARTY_NOTICES.md']);
}
// 14
{
 const s=slide('Preliminary study outputs','All values below are unreviewed AI outputs, using 0° tilt and 2.2 m² per module.');
 text(s,nf(totals.oldCount),64,220,330,70,58,C.green,true);text(s,'Estimated modules · older',64,294,330,50,26);
 text(s,nf(totals.newCount),64,375,330,70,58,C.green,true);text(s,'Estimated modules · newer',64,449,330,50,26);
 text(s,`Footprint totals\n${nf(totals.oldPlan)} → ${nf(totals.newPlan)} m²`,64,545,340,80,27,C.muted);
 const top=[...data].sort((a,b)=>b.now.plan-a.now.plan).slice(0,5);
 const names=top.map(p=>p.title.replace('HAECO · Airport','HAECO').replace('Fairview Park','Fairview\nPark').replace('Hong Lok Yuen','Hong Lok\nYuen'));
 const ch=s.charts.add('bar',{position:{left:430,top:205,width:785,height:365},categories:names,series:[{name:'Newer footprint (m²)',values:top.map(p=>Math.round(p.now.plan)),fill:C.green}],barOptions:{direction:'column',grouping:'clustered',gapWidth:70},hasLegend:false,xAxis:{textStyle:{fontSize:22,fill:C.forest},line:{fill:C.line,width:1}},yAxis:{min:0,max:25000,majorUnit:5000,numberFormatCode:'#,##0',textStyle:{fontSize:21,fill:C.muted},majorGridlines:{fill:C.line,width:1}},dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'#,##0',textStyle:{fontSize:23,fill:C.forest}},chartFill:C.bg,plotAreaFill:C.bg,chartLine:{fill:'none',width:0},plotAreaLine:{fill:'none',width:0}});applyPresentationChartFont(ch,{fontFamily:FONT});
 text(s,'Five largest newer candidate footprints (m²)',430,590,785,52,25,C.green,true);
 note(s,'These totals are calculated directly from the 11 published pair JSON files, using the same summary function as the application. They exclude personal uploads. Older estimated modules total '+totals.oldCount+'; newer total '+totals.newCount+'. Older net plan area '+totals.oldPlan+' m²; newer '+totals.newPlan+' m². All detections are unreviewed and may contain false positives or missed regions. They are not independently verified installation counts. Mixed photo years and old-photo registration also limit change interpretation. The chart shows the five largest newer footprints, rounded to whole m².',['public/demo/manifest.json','src/geometry.js','README.md']);
}
// 15 & 16
for(let part=0;part<2;part++){
 const s=slide(`Site results · ${part+1} of 2`,'Unreviewed estimates · 0° tilt · 2.2 m²/module · footprint areas in m²');
 const subset=data.slice(part?6:0,part?11:6);
 const rows=[['Study','Photo years','Panels\nolder','Panels\nnewer','Footprint\nolder','Footprint\nnewer'],...subset.map(p=>[p.title.replace(' · Airport',''),`${p.olderYear}–${p.newerYear}`,nf(p.old.count),nf(p.now.count),nf(p.old.plan,1),nf(p.now.plan,1)])];
 if(part)rows.push(['All 11 places','Mixed years',nf(totals.oldCount),nf(totals.newCount),nf(totals.oldPlan,1),nf(totals.newPlan,1)]);
 table(s,rows,64,210,1152,378,[256,172,161,161,201,201],24);
 footer(s,'Under the 0° assumption, panel-face area equals footprint. These are candidates to review, not verified installation totals.');
 note(s,'Rows are generated from the original published study assets rather than browser-local QA edits. Areas are rounded to one decimal place for display; totals use unrounded source values. Counts are the sum of rounded per-region estimates. TMT is retained as the supplied site label. At nonzero tilt the app reports a different panel-face area. Locations and complete region records are available in the website and GeoJSON exports.',['public/demo/manifest.json','src/geometry.js','README.md']);
}
// 17
{
 const s=slide('Verification completed','Automated checks and browser walkthroughs cover the implemented workflow.');
 text(s,'24',64,216,300,110,91,C.green,true);text(s,'automated checks passed',64,332,340,76,31);
 text(s,'Live sample\n38 newer candidate regions\n1,893.9 m² footprint\n≈ 861 modules at default assumptions',64,452,470,168,27);
 row(s,'Measurement and data','Area, tilt/count semantics, coordinate restoration, model integrity and all study assets.',205,585,630);
 row(s,'Complete user journey','Current-photo targeting, auto-scan, calibrate, cancel/restart, review, save, map and export.',358,585,630);
 row(s,'Desktop and mobile','Production build and live Pages detection; 390 px layout without page-level overflow.',513,585,630);
 note(s,'The 24 automated checks do not establish detection precision or recall. The live-crop figures are execution evidence only. The older HAECO crop returned zero candidates, which does not prove the complete older site had no panels. Browser verification included manual count and per-area overrides, export/import, original reattachment semantics, pagination, library outputs of 22 summary rows and 2,963 outlines, and cancellation that preserves prior results. No full Hong Kong labeled accuracy benchmark has been completed.',['research/analysis/gui-v2-verification.md','tests/calibration.test.js','tests/geometry.test.js']);
}
// 18
{
 const s=slide('Limits and next steps','A useful review tool needs clear boundaries around the evidence.');
 row(s,'Image and map quality','Match the same boundaries. Check roof alignment, shadows and occlusion; scale and tilt must be reliable.',204,64,565);
 row(s,'Detection accuracy','False positives and missed arrays remain possible, especially in older photographs. Review every candidate.',389,64,565);
 row(s,'Next validation work','Create a labeled HK test set, measure precision/recall and compare estimates with verified module counts.',204,700,516);
 row(s,'Next product work','Consider better instance counting and assisted alignment after validating the current measurement workflow.',389,700,516);
 footer(s,'Old HAECO/Lamma registration is approximate. These 11 areas do not represent all Hong Kong. Next steps are proposed work.');
 note(s,'No accuracy guarantee is claimed. The model segments solar-covered regions, not guaranteed physical panel instances. Aerial orthorectification and panel tilt affect geometry. Manually guessed scales/anchors and oblique photos do not produce valid measurements. Photo-year differences span roughly 8–10 years depending on the pair. Proposed next work is not presented as implemented functionality. Existing safeguards include coverage checks, explicit estimate labels, unknown-value handling and review/exclusion controls.',['README.md','research/analysis/solar_assessment.md','src/geometry.js']);
}
// 19
{
 const s=slide('Five-minute demonstration','Use the public site without installing software or configuring an API key.');
 row(s,'1  Upload a current photo','Auto-detect the upload, or click Detect current photo.',211,64,752);
 row(s,'2  Inspect one region','Open Review; explain the count estimate, footprint and tilt.',327,64,752);
 row(s,'3  Explore the study','Browse Data library, switch map periods and inspect an outline.',443,64,752);
 row(s,'4  Export the findings','Download CSV, GeoJSON or a project JSON for continued work.',559,64,752);
 await img(s,path.join(assets,'mobile.png'),918,185,250,466,'contain','Mobile layout of the redesigned solar comparison workspace');
 note(s,'Suggested presenter flow: open the public URL before starting. The optional HAECO example is under How it works. If inference is slow, use one of the supplied saved studies to explain the workflow while the model loads. Show that ≈ means an estimate. Demonstrate entering a manual count only when verified from original imagery. Close dialogs without saving arbitrary demo edits. A project JSON is the portable backup; originals must be reattached for full-resolution detection; saved previews remain scannable. Website: '+SITE,['README.md',SITE]);
}
// 20
{
 const s=P.slides.add();s.background.fill=C.forest;
 text(s,'Explore Solar Lens HK',64,96,1120,100,62,C.white,true);
 text(s,'Open the website',64,258,1100,44,31,C.gold,true);
 const a=text(s,'matthew169169.github.io/solar-lens-hk',64,317,1120,54,35,C.white);a.text.get('matthew169169.github.io/solar-lens-hk').link={uri:SITE,isExternal:true};
 text(s,'Source, data and documentation',64,427,1100,44,31,C.gold,true);
 const b=text(s,'github.com/matthew169169/solar-lens-hk',64,486,1120,54,35,C.white);b.text.get('github.com/matthew169169/solar-lens-hk').link={uri:'https://github.com/matthew169169/solar-lens-hk',isExternal:true};
 text(s,'Compare photographs. Review the evidence. Export traceable results.',64,620,1120,42,25,'#DDE7DC');
 note(s,'Primary public deployment: '+SITE+'\nRepository: https://github.com/matthew169169/solar-lens-hk\nThe separate private Sites mirror is also deployed. Project reference: functional website release 5148496. Supplied imagery publication was approved by the project owner. Sources and technical detail are recorded in README, the manifest, implementation modules and the verification record.',['README.md','research/analysis/gui-v2-verification.md',SITE]);
}

await fs.mkdir(path.join(build,'renders'),{recursive:true});
for(let i=0;i<P.slides.items.length;i++){const s=P.slides.items[i];const blob=await P.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(build,'renders',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));console.log(`Rendered ${i+1}/20`);}
const draft=path.join(build,'candidate-v21.pptx');await (await PresentationFile.exportPptx(P)).save(draft);
await fs.writeFile(path.join(build,'deck.proto.json'),JSON.stringify(P.toProto()));
if(process.env.DECK_SKIP_FINALIZE==='1'){console.log('Draft exported for visual review');process.exit(0);}
const finalPath=process.env.SOLAR_DECK_OUTPUT || path.join(repo,'docs/presentations/Solar-Lens-HK-Project-and-Functions.pptx');
const result=await finalizePresentation({workspaceDir,candidatePath:draft,finalPath,pythonExecutable:RUNTIME_PYTHON,integrityValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--cover-role','cover',...[3,12,13,15,16].flatMap(n=>['--require-native-table-slide',String(n)])],explicitTotalSlideCount:20,requiredNativeTableOwnerSlides:[3,12,13,15,16],requiredNativeChartOwnerSlides:[14],materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation.json')});
console.log(JSON.stringify(result));
