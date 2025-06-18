import express from 'express';
import Doctor from '../Models/doctor.model.js';
import User from '../Models/user.model.js';

const router = express.Router();

// Get all doctors
router.get('/all', async (req, res) => {
    try {
        const doctors = await Doctor.find().populate('userId', 'email');
        res.status(200).json({
            success: true,
            data: doctors
        });
    } catch (error) {
        console.error('Error fetching doctors:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Search doctors by specialization or location
router.get('/search', async (req, res) => {
    try {
        const { specialization, location, hospital } = req.query;
        const query = {};

        if (specialization) query.specialization = specialization;
        if (location) query.location = location;
        if (hospital) query.hospital = hospital;

        const doctors = await Doctor.find(query).populate('userId', 'email');
        res.status(200).json({
            success: true,
            data: doctors
        });
    } catch (error) {
        console.error('Error searching doctors:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Get doctor by user ID
router.get('/user/:userId', async (req, res) => {
    try {
        // Try to find existing doctor profile
        let doctor = await Doctor.findOne({ userId: req.params.userId });

        // If doctor profile doesn't exist but user is a doctor, create a profile
        if (!doctor) {
            const user = await User.findById(req.params.userId);

            if (user && user.isDoctor) {
                console.log("Creating doctor profile for user:", user._id);

                // Create default availability for weekdays and weekends
                const defaultAvailability = [
                    { day: 'Monday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '17:00', available: true }] },
                    { day: 'Tuesday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '17:00', available: true }] },
                    { day: 'Wednesday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '17:00', available: true }] },
                    { day: 'Thursday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '17:00', available: true }] },
                    { day: 'Friday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '17:00', available: true }] },
                    { day: 'Saturday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '13:00', available: true }] },
                    { day: 'Sunday', dayAvailable: true, slots: [{ startTime: '08:00', endTime: '13:00', available: true }] } // Same as Saturday
                ];

                // Get registration data from user model if available
                const registrationData = {
                    name: user.name || user.username,
                    specialization: user.specialization || (user.doctorReg ? `Medical Doctor (${user.doctorReg})` : "General Practitioner"),
                    hospital: user.hospital || "General Hospital",
                    consultationFee: user.consultationFee || 2000,
                };

                console.log("Using registration data:", registrationData);

                // Create doctor profile with registration data or default values
                doctor = new Doctor({
                    userId: user._id,
                    name: registrationData.name,
                    specialization: registrationData.specialization,
                    hospital: registrationData.hospital,
                    location: user.location || "Sri Lanka",
                    experience: 1, // Default value
                    consultationFee: registrationData.consultationFee,
                    availability: defaultAvailability,
                    bio: `Dr. ${registrationData.name} is a ${registrationData.specialization} specialist at ${registrationData.hospital}.`,
                    image: user.cimage || "https://s3.amazonaws.com/images/doctor.png" // Use user image or default
                });

                await doctor.save();
                console.log("Doctor profile created:", doctor._id);
            } else {
                return res.status(404).json({ success: false, error: 'Doctor not found' });
            }
        }

        res.status(200).json({
            success: true,
            data: doctor
        });
    } catch (error) {
        console.error('Error fetching or creating doctor profile:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Create a new doctor profile
router.post('/create', async (req, res) => {
    try {
        const {
            userId,
            name,
            specialization,
            hospital,
            location,
            experience,
            consultationFee,
            availability,
            bio,
            education,
            certifications,
            languages,
            image
        } = req.body;

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Check if doctor profile already exists
        const existingDoctor = await Doctor.findOne({ userId });
        if (existingDoctor) {
            return res.status(400).json({ success: false, error: 'Doctor profile already exists' });
        }

        // Process availability data to ensure proper format
        let processedAvailability = [];

        try {
            if (availability) {
                processedAvailability = availability.map(day => {
                    // Make sure dayAvailable is a boolean - force conversion to boolean
                    const dayAvailable = day.dayAvailable !== undefined ? Boolean(day.dayAvailable) : true;

                    // Update slots to match day availability if needed
                    const slots = (day.slots || []).map(slot => ({
                        ...slot,
                        // Make sure slot.available is a boolean - force conversion to boolean
                        available: slot.available !== undefined ? Boolean(slot.available) : dayAvailable
                    }));

                    // Create a new object to ensure all properties are properly set
                    return {
                        ...day,
                        dayAvailable,
                        slots,
                        // Ensure these fields are present
                        day: day.day || day.dayName,
                        dayName: day.dayName || day.day,
                        date: day.date || '',
                        displayDate: day.displayDate || ''
                    };
                });
            }

            console.log('Processed availability for new doctor:', JSON.stringify(processedAvailability, null, 2));
        } catch (error) {
            console.error('Error processing availability data:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to process availability data'
            });
        }

        console.log('Processed availability for new doctor:', JSON.stringify(processedAvailability, null, 2));

        // Create new doctor profile
        const doctor = new Doctor({
            userId,
            name,
            specialization,
            hospital,
            location,
            experience,
            consultationFee,
            availability: processedAvailability,
            bio,
            education,
            certifications,
            languages,
            image
        });

        // Mark the availability field as modified to ensure it's saved
        doctor.markModified('availability');

        try {
            await doctor.save();
            console.log('New doctor profile saved successfully with availability:',
                JSON.stringify(doctor.availability, null, 2));
        } catch (saveError) {
            console.error('Error saving new doctor profile:', saveError);
            throw new Error('Failed to save new doctor profile: ' + saveError.message);
        }

        // Update user's isDoctor status and image
        user.isDoctor = true;
        if (image) {
            user.cimage = image;
        }
        await user.save();

        // Count days for a more detailed success message
        const unavailableDays = doctor.availability.filter(day => day.dayAvailable === false).length;
        const availableDays = doctor.availability.filter(day => day.dayAvailable === true).length;
        const totalDays = doctor.availability.length;

        let successMessage = 'Doctor profile created successfully';

        // Add availability summary to the message
        if (availableDays > 0 && unavailableDays > 0) {
            successMessage += `. Available on ${availableDays} days and not available on ${unavailableDays} days`;
        } else if (availableDays > 0) {
            successMessage += `. Available on all ${availableDays} days`;
        } else if (unavailableDays > 0) {
            successMessage += `. Not available on any days`;
        }

        res.status(201).json({
            success: true,
            message: successMessage,
            data: doctor,
            availabilitySummary: {
                totalDays,
                unavailableDays,
                availableDays: totalDays - unavailableDays
            }
        });
    } catch (error) {
        console.error('Error creating doctor profile:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Get doctor by ID
router.get('/:id', async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id).populate('userId', 'email');
        if (!doctor) {
            return res.status(404).json({ success: false, error: 'Doctor not found' });
        }
        res.status(200).json({
            success: true,
            data: doctor
        });
    } catch (error) {
        console.error('Error fetching doctor:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Update doctor profile
router.put('/:id', async (req, res) => {
    try {
        const {
            name,
            specialization,
            hospital,
            location,
            experience,
            consultationFee,
            availability,
            bio,
            education,
            certifications,
            languages,
            image
        } = req.body;

        const doctor = await Doctor.findById(req.params.id);
        if (!doctor) {
            return res.status(404).json({ success: false, error: 'Doctor not found' });
        }

        // Update fields
        if (name) doctor.name = name;
        if (specialization) doctor.specialization = specialization;
        if (hospital) doctor.hospital = hospital;
        if (location) doctor.location = location;
        if (experience) doctor.experience = experience;
        if (consultationFee) doctor.consultationFee = consultationFee;
        if (availability) {
            try {
                // Clear existing availability array to prevent duplicates
                doctor.availability = [];

                // Process and add each day's availability
                const processedAvailability = availability.map(day => {
                    // Make sure dayAvailable is a boolean - force conversion to boolean
                    const dayAvailable = day.dayAvailable !== undefined ? Boolean(day.dayAvailable) : true;

                    // Update slots to match day availability if needed
                    const slots = (day.slots || []).map(slot => ({
                        ...slot,
                        // Make sure slot.available is a boolean - force conversion to boolean
                        available: slot.available !== undefined ? Boolean(slot.available) : dayAvailable
                    }));

                    // Create a new object to ensure all properties are properly set
                    return {
                        ...day,
                        dayAvailable,
                        slots,
                        // Ensure these fields are present
                        day: day.day || day.dayName,
                        dayName: day.dayName || day.day,
                        date: day.date || '',
                        displayDate: day.displayDate || ''
                    };
                });

                // Use the markModified method to ensure Mongoose knows the array has been modified
                doctor.availability = processedAvailability;
                doctor.markModified('availability');

                console.log('Updated availability:', JSON.stringify(doctor.availability, null, 2));
            } catch (error) {
                console.error('Error processing availability data:', error);
                throw new Error('Failed to process availability data');
            }
        }
        if (bio) doctor.bio = bio;
        if (education) doctor.education = education;
        if (certifications) doctor.certifications = certifications;
        if (languages) doctor.languages = languages;
        if (image) {
            doctor.image = image;

            // Also update the user's cimage field
            const user = await User.findById(doctor.userId);
            if (user) {
                user.cimage = image;
                await user.save();
            }
        }

        // Mark the availability field as modified to ensure it's saved
        doctor.markModified('availability');

        try {
            await doctor.save();
            console.log('Doctor profile saved successfully with availability:',
                JSON.stringify(doctor.availability, null, 2));
        } catch (saveError) {
            console.error('Error saving doctor profile:', saveError);
            throw new Error('Failed to save doctor profile: ' + saveError.message);
        }

        // Count days for a more detailed success message
        const unavailableDays = doctor.availability.filter(day => day.dayAvailable === false).length;
        const availableDays = doctor.availability.filter(day => day.dayAvailable === true).length;
        const totalDays = doctor.availability.length;

        let successMessage = 'Doctor profile updated successfully';

        // Add availability summary to the message
        if (availableDays > 0 && unavailableDays > 0) {
            successMessage += `. Available on ${availableDays} days and not available on ${unavailableDays} days`;
        } else if (availableDays > 0) {
            successMessage += `. Available on all ${availableDays} days`;
        } else if (unavailableDays > 0) {
            successMessage += `. Not available on any days`;
        }

        res.status(200).json({
            success: true,
            message: successMessage,
            data: doctor,
            availabilitySummary: {
                totalDays,
                unavailableDays,
                availableDays: totalDays - unavailableDays
            }
        });
    } catch (error) {
        console.error('Error updating doctor profile:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Delete doctor profile
router.delete('/:id', async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id);
        if (!doctor) {
            return res.status(404).json({ success: false, error: 'Doctor not found' });
        }

        // Update user's isDoctor status
        const user = await User.findById(doctor.userId);
        if (user) {
            user.isDoctor = false;
            await user.save();
        }

        await Doctor.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Doctor profile deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting doctor profile:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

export default router;