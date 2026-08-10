Making a Pure Tone Audiometry Simulator based off the simulator available at https://personalpages.manchester.ac.uk/staff/tim.wilding/PTA_Sim/PTAsim.html with documentation available at https://personalpages.manchester.ac.uk/staff/tim.wilding/PTA_Sim/index.html
Key changes include:
1) Updated more modern interface - Phone Touch Friendly, Keyboard Shortcuts for Masking On/Off (M) and Masking Level Up / Down (<Shift + Up Arrow/Down Arrow>), Store (S)
2) Ability to generate and share audiograms as .json in addition to the hyperlink method
3) Ability to toggle Up and Down as louder / quieter or quieter / louder
4) Default to NZ/Australia Icons
5) Allow testing and audiogram generation at 750Hz, 1500Hz
6) Allow selection of Transducer Either Headphones which have a flat IAA = 40dB) or Insertphones IAA varies by Frequency 60db@Hz[125,250,500,750,1000], 50dB@Hz[1500,2000,3000,4000,6000,8000]; Note given how this simulator works this means an additional row for the Thresholds and transmission called Insertphone to cochlea Contra (cross) usiis required with other non-cross references to "Headphone" replaced with "AC Transducer"
Use the images in the folder /Example Images as a design guide
Include a Duration Timer
Allow Save to PDF with Audiogram
The Headphone Insert phone should be a toggle contained within the AC/BC masking select tool